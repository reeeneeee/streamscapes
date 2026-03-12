import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { ingestBus } from '@/lib/ingest-bus';
import type { SpanMessage } from '@/lib/ingest-bus';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  // 1. Read raw body (must not call request.json() — need bytes for HMAC)
  const rawBody = await request.text();

  // 2. Verify GitHub HMAC-SHA256
  const secret = process.env.WEBHOOK_SECRET_GITHUB;
  if (!secret) return new Response('Not configured', { status: 503 });

  const sig = request.headers.get('x-hub-signature-256');
  if (!sig) return new Response('Missing signature', { status: 401 });

  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) {
    return new Response('Invalid signature', { status: 401 });
  }

  // 3. Handle ping events (sent on webhook registration)
  const event = request.headers.get('x-github-event');
  if (event === 'ping') return NextResponse.json({ ok: true });

  // 4. Dedup via X-GitHub-Delivery UUID
  const delivery = request.headers.get('x-github-delivery');
  const g = globalThis as unknown as { __ghDeliveries?: Set<string> };
  g.__ghDeliveries ??= new Set();
  if (delivery && g.__ghDeliveries.has(delivery)) {
    return NextResponse.json({ ok: true });
  }
  if (delivery) {
    g.__ghDeliveries.add(delivery);
    if (g.__ghDeliveries.size > 1000) {
      const arr = [...g.__ghDeliveries];
      g.__ghDeliveries = new Set(arr.slice(-500));
    }
  }

  // 5. Normalize to SpanMessage
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

  ingestBus.publish(msg);
  return NextResponse.json({ ok: true });
}
