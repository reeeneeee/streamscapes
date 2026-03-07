import type { StreamPlugin, DataPoint } from '@/types/stream';

/**
 * Stock ticker stream plugin.
 * Uses Finnhub API via server-side proxy to poll stock quotes.
 */

const SYMBOLS = ['AAPL', 'GOOGL', 'TSLA'];

export const stocksPlugin: StreamPlugin = {
  id: 'stocks',
  name: 'Stock Ticker',
  description: 'Real-time stock price movements',
  category: 'financial',

  async *connect(signal: AbortSignal): AsyncIterable<DataPoint> {
    const prevPrices: Record<string, number> = {};

    while (!signal.aborted) {
      for (const symbol of SYMBOLS) {
        if (signal.aborted) return;

        try {
          const response = await fetch(`/api/streams/stocks?symbol=${symbol}`, { signal });

          if (response.ok) {
            const data = await response.json();
            // Finnhub quote: c=current, pc=previous close, h=high, l=low, d=change, dp=change%
            const price = data.c ?? 0;
            const prevClose = data.pc ?? price;
            const prevPrice = prevPrices[symbol] ?? price;
            const priceDelta = price - prevPrice;
            const priceDeltaPct = prevPrice > 0 ? Math.abs((priceDelta / prevPrice) * 100) : 0;
            const changeFromClose = data.dp ?? 0;

            prevPrices[symbol] = price;

            if (price > 0) {
              yield {
                streamId: 'stocks',
                timestamp: Date.now(),
                fields: {
                  symbol,
                  price,
                  prevClose,
                  changeFromClose,
                  priceDelta,
                  priceDeltaPct,
                  direction: priceDelta >= 0 ? 1 : 0,
                  dayHigh: data.h ?? price,
                  dayLow: data.l ?? price,
                },
              };
            }
          }
        } catch {
          if (signal.aborted) return;
        }
      }

      // Finnhub free tier: 60 calls/min — 3 symbols every 30s = 6/min
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 30_000);
        signal.addEventListener('abort', () => {
          clearTimeout(timeout);
          resolve();
        }, { once: true });
      });
    }
  },
};
