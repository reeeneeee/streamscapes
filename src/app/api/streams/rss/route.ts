import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  // Basic SSRF protection: only allow http/https and known RSS hosts
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return NextResponse.json({ error: 'Invalid protocol' }, { status: 400 });
    }
    // Block private IPs
    const hostname = parsed.hostname;
    if (hostname === 'localhost' || hostname.startsWith('127.') || hostname.startsWith('10.') ||
        hostname.startsWith('192.168.') || hostname.startsWith('172.')) {
      return NextResponse.json({ error: 'Private addresses not allowed' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Streamscapes/1.0 RSS Reader' },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'Feed fetch failed' }, { status: 502 });
    }

    const text = await response.text();

    // Simple XML to JSON parsing for RSS/Atom
    const items = parseRssItems(text);
    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch feed' }, { status: 500 });
  }
}

function parseRssItems(xml: string): Array<{ title: string; link: string; contentSnippet: string }> {
  const items: Array<{ title: string; link: string; contentSnippet: string }> = [];

  // Match <item> (RSS) or <entry> (Atom)
  const itemRegex = /<(?:item|entry)[\s>]([\s\S]*?)<\/(?:item|entry)>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];

    const titleMatch = block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
    const linkMatch = block.match(/<link[^>]*href="([^"]*)"/) ??
                      block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
    const descMatch = block.match(/<(?:description|summary|content)[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/(?:description|summary|content)>/i);

    const title = titleMatch?.[1]?.trim() ?? 'Untitled';
    const link = linkMatch?.[1]?.trim() ?? '';
    const contentSnippet = (descMatch?.[1] ?? '')
      .replace(/<[^>]*>/g, '')
      .trim()
      .slice(0, 200);

    items.push({ title, link, contentSnippet });
  }

  return items.slice(0, 20); // Cap at 20 items
}
