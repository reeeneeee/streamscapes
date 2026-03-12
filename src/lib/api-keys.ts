import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';

/** Hash an API key with SHA-256 for storage/lookup */
export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/** Generate a new API key. Returns { key, hash, prefix }. */
export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const key = crypto.randomBytes(32).toString('base64url');
  const hash = hashApiKey(key);
  const prefix = key.slice(0, 8);
  return { key, hash, prefix };
}

/** Look up the userId that owns a given API key. Returns null if not found. */
export async function lookupApiKey(key: string): Promise<string | null> {
  const hash = hashApiKey(key);
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.apiKeyHash, hash))
    .limit(1);
  return rows[0]?.id ?? null;
}

/** Extract Bearer token from Authorization header */
export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7);
}
