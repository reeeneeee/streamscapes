import { NextResponse } from 'next/server';
import { extractBearerToken, lookupApiKey } from '@/lib/api-keys';
import { agentUpdateHeaders } from '@/lib/agent-version';

export const runtime = 'nodejs';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Agent-Version',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: Request) {
  const token = extractBearerToken(request);
  if (!token) {
    return NextResponse.json({ ok: false, error: 'Missing API key' }, { status: 401, headers: CORS_HEADERS });
  }
  const userId = await lookupApiKey(token);
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Invalid API key' }, { status: 401, headers: CORS_HEADERS });
  }
  const extra = agentUpdateHeaders(request);
  return NextResponse.json({ ok: true }, { headers: { ...CORS_HEADERS, ...extra } });
}
