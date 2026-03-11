import type { SpanMessage } from './ingest-bus';

// OTLP JSON types (subset needed for parsing ExportTraceServiceRequest)

interface OtlpKeyValue {
  key: string;
  value: {
    stringValue?: string;
    intValue?: string | number;
    doubleValue?: number;
    boolValue?: boolean;
  };
}

interface OtlpSpan {
  name?: string;
  startTimeUnixNano?: string;
  endTimeUnixNano?: string;
  kind?: number;
  status?: { code?: number; message?: string };
  attributes?: OtlpKeyValue[];
}

interface OtlpScopeSpans {
  spans?: OtlpSpan[];
}

interface OtlpResourceSpans {
  resource?: { attributes?: OtlpKeyValue[] };
  scopeSpans?: OtlpScopeSpans[];
}

interface OtlpTraceRequest {
  resourceSpans?: OtlpResourceSpans[];
}

function findAttribute(
  attrs: OtlpKeyValue[] | undefined,
  key: string
): string | number | boolean | undefined {
  if (!attrs) return undefined;
  const kv = attrs.find((a) => a.key === key);
  if (!kv) return undefined;
  const v = kv.value;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.intValue !== undefined) return typeof v.intValue === 'string' ? parseInt(v.intValue, 10) : v.intValue;
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.boolValue !== undefined) return v.boolValue;
  return undefined;
}

function computeDurationMs(startNano?: string, endNano?: string): number {
  if (!startNano || !endNano) return 0;
  // OTLP nanosecond timestamps can exceed Number.MAX_SAFE_INTEGER,
  // but the difference (span duration) fits safely in a double.
  const start = BigInt(startNano);
  const end = BigInt(endNano);
  return Number(end - start) / 1e6;
}

/**
 * Parse an OTLP/HTTP JSON ExportTraceServiceRequest body into SpanMessages.
 * Returns an empty array for malformed input (never throws).
 */
export function parseOtlpTraces(body: unknown): SpanMessage[] {
  if (!body || typeof body !== 'object') return [];
  const request = body as OtlpTraceRequest;
  if (!Array.isArray(request.resourceSpans)) return [];

  const messages: SpanMessage[] = [];

  for (const rs of request.resourceSpans) {
    const serviceName =
      (findAttribute(rs.resource?.attributes, 'service.name') as string) ?? 'unknown';

    if (!Array.isArray(rs.scopeSpans)) continue;
    for (const ss of rs.scopeSpans) {
      if (!Array.isArray(ss.spans)) continue;
      for (const span of ss.spans) {
        const durationMs = computeDurationMs(span.startTimeUnixNano, span.endTimeUnixNano);
        const statusCode = span.status?.code ?? 0;
        const httpStatus = findAttribute(span.attributes, 'http.response.status_code');

        messages.push({
          serviceName,
          spanName: span.name ?? '',
          durationMs: Math.max(0, durationMs),
          statusCode,
          kind: span.kind ?? 0,
          timestamp: Date.now(),
          errorMessage: statusCode === 2 ? (span.status?.message ?? undefined) : undefined,
          httpStatusCode: typeof httpStatus === 'number' ? httpStatus : undefined,
        });
      }
    }
  }

  return messages;
}
