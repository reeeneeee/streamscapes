import type { StreamPlugin, DataPoint } from '@/types/stream';

/**
 * Cryptocurrency price stream plugin.
 * Uses the free CoinGecko API (no key required) to poll prices.
 */

const COINS = ['bitcoin', 'ethereum', 'solana'];

export const cryptoPlugin: StreamPlugin = {
  id: 'crypto',
  name: 'Crypto Prices',
  description: 'Real-time cryptocurrency price movements',
  category: 'financial',

  async *connect(signal: AbortSignal): AsyncIterable<DataPoint> {
    let prevPrices: Record<string, number> = {};

    while (!signal.aborted) {
      try {
        const ids = COINS.join(',');
        const response = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
          { signal }
        );

        if (response.ok) {
          const data = await response.json();

          for (const coin of COINS) {
            if (!data[coin]) continue;

            const price = data[coin].usd ?? 0;
            const change24h = data[coin].usd_24h_change ?? 0;
            const prevPrice = prevPrices[coin] ?? price;
            const priceDelta = price - prevPrice;
            const priceDeltaPct = prevPrice > 0 ? (priceDelta / prevPrice) * 100 : 0;

            prevPrices[coin] = price;

            yield {
              streamId: 'crypto',
              timestamp: Date.now(),
              fields: {
                coin,
                price,
                change24h,
                priceDelta,
                priceDeltaPct: Math.abs(priceDeltaPct),
                direction: priceDelta >= 0 ? 1 : 0,
              },
            };
          }
        }
      } catch {
        if (signal.aborted) return;
      }

      // CoinGecko free tier: max 10-30 calls/min — poll every 30 seconds
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
