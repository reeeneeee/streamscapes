import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { db } from '@/db';
import { users } from '@/db/schema';
import { generateApiKey, lookupApiKey } from '@/lib/api-keys';

export const runtime = 'nodejs';

/** In-memory rate limit fallback when Redis is unavailable */
const memoryRL = new Map<string, { count: number; resetAt: number }>();

function getClientIP(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    '127.0.0.1'
  );
}

const MAX_KEYS_PER_HOUR = 20;
const WINDOW_SECONDS = 3600;

export async function POST(req: NextRequest) {
  // If caller sends their existing key, this is a regenerate — skip rate limit
  const oldKey = req.headers.get('x-old-api-key');
  const isRegenerate = oldKey ? !!(await lookupApiKey(oldKey)) : false;

  if (!isRegenerate) {
    const ip = getClientIP(req);
    const rlKey = `anon-rl:${ip}`;
    let usedRedis = false;

    if (redis) {
      try {
        const count = await redis.get<number>(rlKey);
        if (count !== null && count >= MAX_KEYS_PER_HOUR) {
          return NextResponse.json(
            { error: 'Rate limit exceeded — try again later' },
            { status: 429 },
          );
        }
        usedRedis = true;
      } catch {
        // Redis unavailable — fall through to memory
      }
    }

    if (!usedRedis) {
      const now = Date.now();
      const entry = memoryRL.get(ip);
      if (entry && now < entry.resetAt && entry.count >= MAX_KEYS_PER_HOUR) {
        return NextResponse.json(
          { error: 'Rate limit exceeded — try again later' },
          { status: 429 },
        );
      }
    }
  }

  try {
    // Generate API key
    const { key, hash, prefix } = generateApiKey();
    // Create anonymous user row
    const [row] = await db
      .insert(users)
      .values({
        username: `anon-${crypto.randomUUID().slice(0, 12)}`,
        name: 'Anonymous',
        email: null,
        apiKeyHash: hash,
        apiKeyPrefix: prefix,
      })
      .returning({ id: users.id });

    // Increment rate limit (skip for regenerates)
    if (!isRegenerate) {
      const ip = getClientIP(req);
      const rlKey = `anon-rl:${ip}`;
      let incRedis = false;
      if (redis) {
        try {
          const pipeline = redis.pipeline();
          pipeline.incr(rlKey);
          pipeline.expire(rlKey, WINDOW_SECONDS);
          await pipeline.exec();
          incRedis = true;
        } catch {
          // Redis unavailable — fall through to memory
        }
      }
      if (!incRedis) {
        const now = Date.now();
        const entry = memoryRL.get(ip);
        if (entry && now < entry.resetAt) {
          entry.count++;
        } else {
          memoryRL.set(ip, { count: 1, resetAt: now + WINDOW_SECONDS * 1000 });
        }
      }
    }

    return NextResponse.json({ key, prefix, userId: row.id });
  } catch (err) {
    console.error('[anonymous-key] Error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
