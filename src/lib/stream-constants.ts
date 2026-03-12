export const STREAM_COLORS: Record<string, string> = {
  weather: '#7C444F',
  flights: '#5C7285',
  wikipedia: '#5D8736',
  rss: '#B8860B',
  stocks: '#E6A817',
};

export const STREAM_CSS_COLORS: Record<string, string> = {
  weather: 'var(--stream-weather)',
  flights: 'var(--stream-flights)',
  wikipedia: 'var(--stream-wikipedia)',
  rss: 'var(--stream-rss)',
  stocks: 'var(--stream-stocks)',
};

export const STREAM_LABELS: Record<string, string> = {
  weather: 'Weather',
  flights: 'Flights',
  wikipedia: 'Wikipedia',
  rss: 'RSS',
  stocks: 'Stocks',
};

// 12-color palette for dynamically-created OTLP service channels,
// distinct from the 5 built-in stream accent colors.
const OTLP_COLORS = [
  '#6A8CAF', '#A47B8E', '#7BA68A', '#C49A5C', '#8B7BB5',
  '#5C9E9E', '#B57A5A', '#6D8F5E', '#9E6A8C', '#7A9AB5',
  '#B08A5B', '#5E8A7A',
];

let otlpColorIndex = 0;
const otlpColorMap = new Map<string, string>();

export function getStreamColor(id: string): string {
  if (STREAM_COLORS[id]) return STREAM_COLORS[id];
  if (id === 'github:github') return '#6e7681';
  if (id.startsWith('otlp:') || id.startsWith('dd:') || id.startsWith('github:') || id.startsWith('notify:')) {
    if (!otlpColorMap.has(id)) {
      otlpColorMap.set(id, OTLP_COLORS[otlpColorIndex % OTLP_COLORS.length]);
      otlpColorIndex++;
    }
    return otlpColorMap.get(id)!;
  }
  return '#888';
}

export function getStreamLabel(id: string): string {
  if (STREAM_LABELS[id]) return STREAM_LABELS[id];
  const colonIdx = id.indexOf(':');
  if (colonIdx > 0) return id.slice(colonIdx + 1);
  return id;
}
