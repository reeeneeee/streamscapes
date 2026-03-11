import { NextResponse } from 'next/server';
import { setDatadogConfig, getDatadogStatus, type DatadogConfig } from '@/lib/datadog-adapter';

export const runtime = 'nodejs';

/** POST — configure Datadog credentials + start/stop polling */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Clear credentials
  if (body.action === 'clear') {
    setDatadogConfig(null);
    return NextResponse.json({ status: 'cleared' });
  }

  // Configure
  const { apiKey, appKey, site, query } = body as Partial<DatadogConfig>;
  if (!apiKey || !appKey || !site) {
    return NextResponse.json(
      { error: 'Missing required fields: apiKey, appKey, site' },
      { status: 400 },
    );
  }

  setDatadogConfig({ apiKey, appKey, site, query: query ?? '' });
  return NextResponse.json({ status: 'configured' });
}

/** GET — check current polling status */
export async function GET() {
  return NextResponse.json(getDatadogStatus());
}
