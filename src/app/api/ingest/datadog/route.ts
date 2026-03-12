import { NextResponse } from 'next/server';
import { setDatadogConfig, getDatadogStatus, type DatadogConfig } from '@/lib/datadog-adapter';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';

/** POST — configure Datadog credentials + start/stop polling (per-user) */
export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (body.action === 'clear') {
    setDatadogConfig(userId, null);
    return NextResponse.json({ status: 'cleared' });
  }

  const { apiKey, appKey, site, query } = body as Partial<DatadogConfig>;
  if (!apiKey || !appKey || !site) {
    return NextResponse.json(
      { error: 'Missing required fields: apiKey, appKey, site' },
      { status: 400 },
    );
  }

  setDatadogConfig(userId, { apiKey, appKey, site, query: query ?? '' });
  return NextResponse.json({ status: 'configured' });
}

/** GET — check current polling status (per-user) */
export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response('Unauthorized', { status: 401 });

  return NextResponse.json(getDatadogStatus(userId));
}
