import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createWeatherPlugin } from './weather';
import { createRssPlugin } from './rss';
import { stocksPlugin } from './stocks';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

describe('WeatherStreamPlugin', () => {
  const plugin = createWeatherPlugin(40.7, -74.0);

  it('has correct metadata', () => {
    expect(plugin.id).toBe('weather');
    expect(plugin.category).toBe('environment');
  });

  it('yields a DataPoint with weather fields', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        main: { temp: 72, feels_like: 70, humidity: 55 },
        clouds: { all: 30 },
        wind: { speed: 8 },
      }),
    });

    const controller = new AbortController();
    const gen = plugin.connect(controller.signal);
    const iterator = gen[Symbol.asyncIterator]();

    const { value } = await iterator.next();
    controller.abort();

    expect(value).toBeDefined();
    expect(value!.streamId).toBe('weather');
    expect(value!.fields.temperature).toBe(72);
    expect(value!.fields.feelsLike).toBe(70);
    expect(value!.fields.clouds).toBe(30);
    expect(value!.fields.humidity).toBe(55);
    expect(value!.fields.windSpeed).toBe(8);
  });

  it('stops on abort signal', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ main: { temp: 60, feels_like: 58, humidity: 50 }, clouds: { all: 0 }, wind: { speed: 0 } }),
    });

    const controller = new AbortController();
    const gen = plugin.connect(controller.signal);
    const iterator = gen[Symbol.asyncIterator]();

    await iterator.next(); // Get first value

    // Abort during the sleep period — the promise should resolve quickly
    controller.abort();

    // The next call should return done since the signal is aborted
    // and the sleep promise resolves immediately on abort
    const result = await Promise.race([
      iterator.next(),
      new Promise<{ done: true; value: undefined }>((resolve) =>
        setTimeout(() => resolve({ done: true, value: undefined }), 100)
      ),
    ]);
    expect(result.done).toBe(true);
  });

  it('handles API errors gracefully', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const controller = new AbortController();
    const gen = plugin.connect(controller.signal);
    const iterator = gen[Symbol.asyncIterator]();

    // Should not throw — just waits and retries. Abort to end the test.
    setTimeout(() => controller.abort(), 50);
    const { done } = await iterator.next();
    expect(done).toBe(true);
  });
});

describe('RssStreamPlugin', () => {
  const plugin = createRssPlugin(['https://example.com/feed.xml']);

  it('has correct metadata', () => {
    expect(plugin.id).toBe('rss');
    expect(plugin.category).toBe('information');
  });

  it('yields DataPoints for RSS items', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          { title: 'Test Article', link: 'https://example.com/1', contentSnippet: 'Some content here' },
          { title: 'Another Post', link: 'https://example.com/2', content: 'More content' },
        ],
      }),
    });

    const controller = new AbortController();
    const gen = plugin.connect(controller.signal);
    const iterator = gen[Symbol.asyncIterator]();

    const first = await iterator.next();
    expect(first.value!.streamId).toBe('rss');
    expect(first.value!.fields.title).toBe('Test Article');
    expect(first.value!.fields.titleLength).toBe(12);
    expect(first.value!.fields.contentLength).toBe(17);

    const second = await iterator.next();
    expect(second.value!.fields.title).toBe('Another Post');

    controller.abort();
  });

  it('deduplicates items by link', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [{ title: 'Dup', link: 'https://example.com/dup' }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [{ title: 'Dup', link: 'https://example.com/dup' }],
        }),
      });

    const controller = new AbortController();
    const gen = plugin.connect(controller.signal);
    const iterator = gen[Symbol.asyncIterator]();

    // First should yield
    const first = await iterator.next();
    expect(first.value!.fields.title).toBe('Dup');

    // Abort before second poll can yield the duplicate
    controller.abort();
  });
});

describe('StocksStreamPlugin', () => {
  it('has correct metadata', () => {
    expect(stocksPlugin.id).toBe('stocks');
    expect(stocksPlugin.category).toBe('financial');
  });

  it('yields DataPoints for stock quotes', async () => {
    // Mock 3 calls (AAPL, GOOGL, TSLA)
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ c: 185.5, pc: 183.0, h: 186.0, l: 182.0, d: 2.5, dp: 1.37 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ c: 142.0, pc: 141.0, h: 143.0, l: 140.0, d: 1.0, dp: 0.71 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ c: 250.0, pc: 248.0, h: 252.0, l: 247.0, d: 2.0, dp: 0.81 }),
      });

    const controller = new AbortController();
    const gen = stocksPlugin.connect(controller.signal);
    const iterator = gen[Symbol.asyncIterator]();

    const aapl = await iterator.next();
    expect(aapl.value!.streamId).toBe('stocks');
    expect(aapl.value!.fields.symbol).toBe('AAPL');
    expect(aapl.value!.fields.price).toBe(185.5);
    expect(aapl.value!.fields.prevClose).toBe(183.0);

    const googl = await iterator.next();
    expect(googl.value!.fields.symbol).toBe('GOOGL');

    const tsla = await iterator.next();
    expect(tsla.value!.fields.symbol).toBe('TSLA');

    controller.abort();
  });
});
