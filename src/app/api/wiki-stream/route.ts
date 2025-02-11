import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET() {
  const encoder = new TextEncoder();
  let isControllerClosed = false;

  const customReadable = new ReadableStream({
    async start(controller) {
      try {
        const response = await fetch('https://stream.wikimedia.org/v2/stream/mediawiki.recentchange', {
          headers: {
            'User-Agent': 'music-stream-app/1.0 (https://github.com/yourusername/music-stream)',
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
          
          if (done) {
            console.log('Stream complete');
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = line.slice(6);
                if (!isControllerClosed) {
                  controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                }
              } catch (enqueueError) {
                console.error('Error enqueueing data:', enqueueError);
                isControllerClosed = true;
                break;
              }
            }
          }
        }

        reader.releaseLock();
      } catch (error) {
        console.error('Stream error:', error);
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
      console.log('Stream cancelled by client');
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
