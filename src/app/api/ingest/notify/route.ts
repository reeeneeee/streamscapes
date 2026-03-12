import { NextResponse } from 'next/server';
import { ingestBus } from '@/lib/ingest-bus';
import type { SpanMessage } from '@/lib/ingest-bus';
import { extractBearerToken, lookupApiKey } from '@/lib/api-keys';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  // Authenticate via API key
  const token = extractBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: 'Missing Authorization: Bearer <api-key>' }, { status: 401 });
  }
  const userId = await lookupApiKey(token);
  if (!userId) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
  }

  const body = await request.json();
  if (typeof body !== 'object' || body === null) {
    return new Response('Expected JSON object', { status: 400 });
  }
  const msg: SpanMessage = {
    serviceName: typeof body.app === 'string' ? body.app : 'unknown',
    spanName: typeof body.text === 'string' ? body.text : '',
    durationMs: 0,
    statusCode: 1,
    kind: 1,
    timestamp: typeof body.timestamp === 'number' ? body.timestamp : Date.now(),
    source: 'notify',
  };
  ingestBus.publishToUser(userId, msg);
  return NextResponse.json({ ok: true });
}
