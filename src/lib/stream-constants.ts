// Pastel palette for general data streams
export const STREAM_COLORS: Record<string, string> = {
  weather: '#C4889A',
  'weather:temp': '#C4889A',
  'weather:clouds': '#B0A0B8',
  flights: '#9AB4C6',
  wikipedia: '#A3C484',
  rss: '#D4B87A',
  stocks: '#E8C96E',
  archive: '#8B9DAF',
};

export const STREAM_CSS_COLORS: Record<string, string> = {
  weather: 'var(--stream-weather)',
  flights: 'var(--stream-flights)',
  wikipedia: 'var(--stream-wikipedia)',
  rss: 'var(--stream-rss)',
  stocks: 'var(--stream-stocks)',
  archive: 'var(--stream-archive)',
};

export const STREAM_LABELS: Record<string, string> = {
  weather: 'Weather',
  'weather:temp': 'Temperature',
  'weather:clouds': 'Cloud Cover',
  flights: 'Air Traffic',
  wikipedia: 'Wikipedia',
  rss: 'RSS',
  stocks: 'Stocks',
  archive: 'Internet Archive',
  'watch:heartRate': 'Heart Rate',
  'watch:steps': 'Steps',
};

// Neon palette for personal signal channels (OTLP/DD/GitHub/notify)
const OTLP_COLORS = [
  '#00E5FF', '#FF3DFF', '#39FF14', '#FFD600', '#7C4DFF',
  '#00FFAB', '#FF6E40', '#76FF03', '#E040FB', '#18FFFF',
  '#FFAB40', '#00E676',
];

let otlpColorIndex = 0;
const otlpColorMap = new Map<string, string>();

export function getStreamColor(id: string): string {
  if (STREAM_COLORS[id]) return STREAM_COLORS[id];
  if (id.startsWith('archive:')) return STREAM_COLORS.archive;
  if (id.startsWith('watch:')) return '#E88D8D';
  if (id.startsWith('otlp:') || id.startsWith('dd:') || id.startsWith('github:') || id.startsWith('notify:') || id.startsWith('chrome:')) {
    if (!otlpColorMap.has(id)) {
      otlpColorMap.set(id, OTLP_COLORS[otlpColorIndex % OTLP_COLORS.length]);
      otlpColorIndex++;
    }
    return otlpColorMap.get(id)!;
  }
  return '#B0A0B8'; // muted lavender fallback — never gray
}

/** Shorten long hyphenated service names: "filament-prod-fastapi-service" → "fastapi-service" */
function shortenServiceName(name: string): string {
  if (name.length <= 20) return name;
  // Drop common prefixes/infixes like env names
  const parts = name.split('-');
  const drop = new Set(['prod', 'staging', 'dev', 'qa', 'service', 'svc']);
  const meaningful = parts.filter(p => !drop.has(p));
  if (meaningful.length > 0 && meaningful.join('-').length < name.length) {
    const short = meaningful.join('-');
    if (short.length > 0) return short;
  }
  // If still long, take last 2 segments
  if (parts.length > 2) return parts.slice(-2).join('-');
  return name;
}

export function getStreamLabel(id: string): string {
  if (STREAM_LABELS[id]) return STREAM_LABELS[id];
  const colonIdx = id.indexOf(':');
  if (colonIdx > 0) return shortenServiceName(id.slice(colonIdx + 1));
  return id;
}
