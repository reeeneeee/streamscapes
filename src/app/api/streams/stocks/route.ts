import { NextResponse } from 'next/server';

const FINNHUB_KEY = process.env.FINNHUB_API_KEY;

export async function GET(request: Request) {
  if (!FINNHUB_KEY) {
    return NextResponse.json({ error: 'FINNHUB_API_KEY not configured' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol') ?? 'AAPL';

  // Validate symbol: only allow alphanumeric + dot (e.g. BRK.B)
  if (!/^[A-Z0-9.]{1,10}$/i.test(symbol)) {
    return NextResponse.json({ error: 'Invalid symbol' }, { status: 400 });
  }

  try {
    const response = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol.toUpperCase())}&token=${FINNHUB_KEY}`,
    );

    if (!response.ok) {
      return NextResponse.json({ error: 'Finnhub API error' }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch stock data' }, { status: 500 });
  }
}
