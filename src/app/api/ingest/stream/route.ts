import { NextResponse } from 'next/server';
import { ingestBus } from '@/lib/ingest-bus';
import { checkPollingLifecycle } from '@/lib/datadog-adapter';

export const runtime = 'nodejs';

export async function GET() {
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      unsubscribe = ingestBus.subscribe((msg) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(msg)}\n\n`));
        } catch {
          // Controller closed
          closed = true;
        }
      });
      // Subscriber added — start DD polling if configured
      checkPollingLifecycle();
    },
    cancel() {
      closed = true;
      unsubscribe?.();
      // Subscriber removed — stop DD polling if no more listeners
      checkPollingLifecycle();
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
