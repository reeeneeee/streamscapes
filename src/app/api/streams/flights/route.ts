import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const bounds = searchParams.get('bounds');

  if (!bounds) {
    return NextResponse.json({ error: 'bounds parameter is required' }, { status: 400 });
  }

  const apiKey = process.env.FLIGHTRADAR24_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Flightradar24 API key not configured' }, { status: 500 });
  }

  const url = `https://fr24api.flightradar24.com/api/live/flight-positions/light?bounds=${bounds}`;

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'Accept-Version': 'v1',
      'Authorization': `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: 'Failed to fetch flight data' },
      { status: response.status }
    );
  }

  const data = await response.json();
  return NextResponse.json(data);
}
