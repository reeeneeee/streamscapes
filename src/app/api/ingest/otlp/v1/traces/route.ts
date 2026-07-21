import { NextResponse } from 'next/server';
import { ingestBus } from '@/lib/ingest-bus';
import { parseOtlpTraces } from '@/lib/otlp-parse';
import { extractBearerToken, lookupApiKey } from '@/lib/api-keys';
import { auth } from '@/lib/auth';
import { agentUpdateHeaders } from '@/lib/agent-version';

export const runtime = 'nodejs';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Agent-Version',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: Request) {
  // Authenticate via API key (external) or session cookie (browser replay)
  let userId: string | null = null;
  const token = extractBearerToken(request);
  if (token) {
    userId = await lookupApiKey(token);
  } else {
    const session = await auth();
    userId = session?.user?.id ?? null;
  }
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized — provide Bearer API key or sign in' }, { status: 401, headers: CORS_HEADERS });
  }

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return NextResponse.json(
      { error: 'Unsupported content type. Use application/json (set OTEL_EXPORTER_OTLP_PROTOCOL=http/json).' },
      { status: 415 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const messages = parseOtlpTraces(body);

  const url = new URL(request.url);
  const sourceOverride = url.searchParams.get('source') as 'otlp' | 'datadog' | 'browser' | 'system' | 'watch' | null;
  const isReplay = url.searchParams.get('replay') === '1';

  for (const msg of messages) {
    const overrides: Record<string, unknown> = {};
    if (sourceOverride) overrides.source = sourceOverride;
    if (isReplay) overrides.replay = true;
    const published = Object.keys(overrides).length > 0 ? { ...msg, ...overrides } : msg;
    ingestBus.publishToUser(userId, published);
  }

  const extra = agentUpdateHeaders(request);
  return NextResponse.json({}, { headers: { ...CORS_HEADERS, ...extra } });
}
