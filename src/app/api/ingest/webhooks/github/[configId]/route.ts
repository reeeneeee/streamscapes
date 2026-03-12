import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { ingestBus } from '@/lib/ingest-bus';
import type { SpanMessage } from '@/lib/ingest-bus';
import { db } from '@/db';
import { sourceConfigs } from '@/db/schema';
import { decrypt } from '@/lib/crypto';

export const runtime = 'nodejs';

// Per-config dedup sets, keyed by configId
const g = globalThis as unknown as { __ghDeliveries?: Map<string, Set<string>> };
g.__ghDeliveries ??= new Map();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ configId: string }> },
) {
  const { configId } = await params;

  // 1. Look up the source config by ID
  const configs = await db
    .select()
    .from(sourceConfigs)
    .where(eq(sourceConfigs.id, configId))
    .limit(1);

  const config = configs[0];
  if (!config || config.type !== 'github' || !config.encryptedCredentials) {
    return new Response('Not found', { status: 404 });
  }

  // 2. Decrypt the webhook secret
  let secret: string;
  try {
    const creds = JSON.parse(decrypt(config.encryptedCredentials));
    secret = creds.webhookSecret;
    if (!secret) return new Response('Webhook secret not configured', { status: 503 });
  } catch {
    return new Response('Config error', { status: 500 });
  }

  // 3. Read raw body and verify HMAC-SHA256
  const rawBody = await request.text();
  const sig = request.headers.get('x-hub-signature-256');
  if (!sig) return new Response('Missing signature', { status: 401 });

  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) {
    return new Response('Invalid signature', { status: 401 });
  }

  // 4. Handle ping events
  const event = request.headers.get('x-github-event');
  if (event === 'ping') return NextResponse.json({ ok: true });

  // 5. Dedup via X-GitHub-Delivery
  const delivery = request.headers.get('x-github-delivery');
  let dedupSet = g.__ghDeliveries!.get(configId);
  if (!dedupSet) {
    dedupSet = new Set();
    g.__ghDeliveries!.set(configId, dedupSet);
  }
  if (delivery && dedupSet.has(delivery)) {
    return NextResponse.json({ ok: true });
  }
  if (delivery) {
    dedupSet.add(delivery);
    if (dedupSet.size > 1000) {
      const arr = [...dedupSet];
      g.__ghDeliveries!.set(configId, new Set(arr.slice(-500)));
    }
  }

  // 6. Normalize to SpanMessage and publish to the config owner's bus channel
  const payload = JSON.parse(rawBody);
  const action = payload.action ? `.${payload.action}` : '';
  const spanName = `${event}${action}`;

  const msg: SpanMessage = {
    serviceName: 'github',
    spanName,
    durationMs: event === 'push' ? (payload.commits?.length ?? 1) * 100 : 0,
    statusCode: event === 'security_advisory' ? 2 : 1,
    kind: 1,
    timestamp: Date.now(),
    source: 'github',
  };

  ingestBus.publishToUser(config.userId, msg);
  return NextResponse.json({ ok: true });
}
