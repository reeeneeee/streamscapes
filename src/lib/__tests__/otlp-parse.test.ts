import { describe, it, expect } from 'vitest';
import { parseOtlpTraces } from '../otlp-parse';

describe('parseOtlpTraces', () => {
  it('parses a valid OTLP trace request', () => {
    const body = {
      resourceSpans: [{
        resource: {
          attributes: [{ key: 'service.name', value: { stringValue: 'my-service' } }],
        },
        scopeSpans: [{
          spans: [{
            name: 'GET /users',
            kind: 2,
            startTimeUnixNano: '1700000000000000000',
            endTimeUnixNano: '1700000000250000000',
            status: { code: 1 },
            attributes: [
              { key: 'http.response.status_code', value: { intValue: 200 } },
            ],
          }],
        }],
      }],
    };

    const msgs = parseOtlpTraces(body);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].serviceName).toBe('my-service');
    expect(msgs[0].spanName).toBe('GET /users');
    expect(msgs[0].durationMs).toBe(250);
    expect(msgs[0].statusCode).toBe(1);
    expect(msgs[0].kind).toBe(2);
    expect(msgs[0].httpStatusCode).toBe(200);
    expect(msgs[0].errorMessage).toBeUndefined();
  });

  it('parses error spans with status message', () => {
    const body = {
      resourceSpans: [{
        resource: { attributes: [] },
        scopeSpans: [{
          spans: [{
            name: 'POST /pay',
            kind: 3,
            startTimeUnixNano: '1700000000000000000',
            endTimeUnixNano: '1700000000500000000',
            status: { code: 2, message: 'connection refused' },
            attributes: [],
          }],
        }],
      }],
    };

    const msgs = parseOtlpTraces(body);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].serviceName).toBe('unknown');
    expect(msgs[0].statusCode).toBe(2);
    expect(msgs[0].durationMs).toBe(500);
    expect(msgs[0].errorMessage).toBe('connection refused');
  });

  it('handles multiple spans across resources and scopes', () => {
    const body = {
      resourceSpans: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'svc-a' } }] },
          scopeSpans: [{
            spans: [
              { name: 'span1', startTimeUnixNano: '100000000000', endTimeUnixNano: '100100000000', status: {} },
              { name: 'span2', startTimeUnixNano: '100000000000', endTimeUnixNano: '100200000000', status: { code: 0 } },
            ],
          }],
        },
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'svc-b' } }] },
          scopeSpans: [{
            spans: [{ name: 'span3', startTimeUnixNano: '100000000000', endTimeUnixNano: '100050000000' }],
          }],
        },
      ],
    };

    const msgs = parseOtlpTraces(body);
    expect(msgs).toHaveLength(3);
    expect(msgs[0].serviceName).toBe('svc-a');
    expect(msgs[1].serviceName).toBe('svc-a');
    expect(msgs[2].serviceName).toBe('svc-b');
  });

  it('returns empty array for null/undefined/non-object input', () => {
    expect(parseOtlpTraces(null)).toEqual([]);
    expect(parseOtlpTraces(undefined)).toEqual([]);
    expect(parseOtlpTraces('string')).toEqual([]);
    expect(parseOtlpTraces(42)).toEqual([]);
  });

  it('returns empty array for missing resourceSpans', () => {
    expect(parseOtlpTraces({})).toEqual([]);
    expect(parseOtlpTraces({ resourceSpans: 'not-an-array' })).toEqual([]);
  });

  it('handles missing optional fields gracefully', () => {
    const body = {
      resourceSpans: [{
        scopeSpans: [{
          spans: [{ name: 'minimal' }],
        }],
      }],
    };

    const msgs = parseOtlpTraces(body);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].serviceName).toBe('unknown');
    expect(msgs[0].spanName).toBe('minimal');
    expect(msgs[0].durationMs).toBe(0);
    expect(msgs[0].statusCode).toBe(0);
    expect(msgs[0].kind).toBe(0);
  });

  it('handles intValue as string (OTLP JSON encoding)', () => {
    const body = {
      resourceSpans: [{
        resource: { attributes: [] },
        scopeSpans: [{
          spans: [{
            name: 'test',
            startTimeUnixNano: '1700000000000000000',
            endTimeUnixNano: '1700000000100000000',
            attributes: [
              { key: 'http.response.status_code', value: { intValue: '500' } },
            ],
          }],
        }],
      }],
    };

    const msgs = parseOtlpTraces(body);
    // intValue as string gets parsed by parseInt, but findAttribute returns it as number only if intValue is number
    // In the current implementation, string intValue is parsed to number
    expect(msgs).toHaveLength(1);
    expect(msgs[0].httpStatusCode).toBe(500);
  });
});
