import { NextResponse } from 'next/server';
import { ingestBus } from '@/lib/ingest-bus';
import { parseOtlpTraces } from '@/lib/otlp-parse';

export const runtime = 'nodejs';

export async function POST(request: Request) {
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

  for (const msg of messages) {
    ingestBus.publish(msg);
  }

  // OTLP spec: 200 with empty ExportTraceServiceResponse
  return NextResponse.json({});
}
