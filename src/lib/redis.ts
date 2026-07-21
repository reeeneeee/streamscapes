import { Redis } from '@upstash/redis';

/**
 * Upstash Redis client (HTTP-based, works in serverless).
 * Returns null if env vars are not configured — features gracefully degrade
 * to in-memory only (works on localhost, breaks cross-isolate on Vercel).
 */
function createRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

// Survive HMR in dev
const g = globalThis as unknown as { __upstashRedis?: Redis | null };
if (g.__upstashRedis === undefined) {
  g.__upstashRedis = createRedis();
}

export const redis: Redis | null = g.__upstashRedis;
