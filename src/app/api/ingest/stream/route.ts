import { NextResponse } from 'next/server';
import { ingestBus } from '@/lib/ingest-bus';
import { checkPollingLifecycle } from '@/lib/datadog-adapter';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET() {
  // Authenticate via session cookie — only logged-in users get an SSE stream
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      unsubscribe = ingestBus.subscribeToUser(userId, (msg) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(msg)}\n\n`));
        } catch {
          closed = true;
        }
      });
      // Subscriber added — start DD polling for this user if configured
      checkPollingLifecycle(userId);
    },
    cancel() {
      closed = true;
      unsubscribe?.();
      // Subscriber removed — stop DD polling for this user if no more listeners
      checkPollingLifecycle(userId);
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
