export const LATEST_AGENT_VERSION = '0.1.0';
export const AGENT_DOWNLOAD_URL =
  'https://github.com/reeeneeee/streamscapes/releases/latest';

/** Returns true if clientVersion < LATEST_AGENT_VERSION (semver). */
export function isStale(clientVersion: string): boolean {
  const [cMaj, cMin, cPat] = clientVersion.split('.').map(Number);
  const [lMaj, lMin, lPat] = LATEST_AGENT_VERSION.split('.').map(Number);
  if (cMaj !== lMaj) return cMaj < lMaj;
  if (cMin !== lMin) return cMin < lMin;
  return cPat < lPat;
}

/** If request has X-Agent-Version and it's stale, return update headers. */
export function agentUpdateHeaders(
  request: Request,
): Record<string, string> {
  const v = request.headers.get('x-agent-version');
  if (!v || !isStale(v)) return {};
  return {
    'X-Agent-Update': AGENT_DOWNLOAD_URL,
    'X-Agent-Latest': LATEST_AGENT_VERSION,
  };
}
