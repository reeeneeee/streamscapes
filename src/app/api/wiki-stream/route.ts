import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  const encoder = new TextEncoder();
  let isControllerClosed = false;

  const customReadable = new ReadableStream({
    async start(controller) {
      try {
        const response = await fetch('https://stream.wikimedia.org/v2/stream/mediawiki.recentchange', {
          headers: {
            'User-Agent': 'streamscapes/1.0 (https://github.com/reeeneeee/streamscapes)',
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No reader available');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (!isControllerClosed) {
          const { done, value } = await reader.read();

          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const jsonStr = line.slice(6);
                // Server-side filtering: only forward en.wikipedia.org edits
                const data = JSON.parse(jsonStr);
                if (
                  data.server_name === 'en.wikipedia.org' &&
                  data.type === 'edit'
                ) {
                  if (!isControllerClosed) {
                    controller.enqueue(encoder.encode(`data: ${jsonStr}\n\n`));
                  }
                }
              } catch {
                // Skip malformed JSON lines
              }
            }
          }
        }

        reader.releaseLock();
      } catch (error) {
        if (!isControllerClosed) {
          isControllerClosed = true;
          controller.error(error);
        }
      } finally {
        if (!isControllerClosed) {
          isControllerClosed = true;
          controller.close();
        }
      }
    },

    cancel() {
      isControllerClosed = true;
    }
  });

  return new NextResponse(customReadable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
