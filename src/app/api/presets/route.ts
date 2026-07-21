import { auth } from '@/lib/auth';
import { getMobileUser } from '@/lib/mobile-auth';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import type { ChannelConfig } from '@/types/sonification';

/** Get user ID from cookie session or mobile Bearer token. */
async function getUserId(req: NextRequest): Promise<string | null> {
  const session = await auth();
  if (session?.user?.id) return session.user.id;
  const mobile = await getMobileUser(req);
  return mobile?.id ?? null;
}

const PUBLIC_STREAMS = new Set([
  'weather', 'weather:temp', 'weather:clouds',
  'flights', 'wikipedia', 'rss', 'stocks',
]);

function stripPrivateChannels(channels: Record<string, ChannelConfig>): Record<string, ChannelConfig> {
  const result: Record<string, ChannelConfig> = {};
  for (const [id, config] of Object.entries(channels)) {
    if (PUBLIC_STREAMS.has(id)) {
      result[id] = config;
    }
  }
  return result;
}

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${suffix}`;
}

/** GET /api/presets — list all shared presets (public feed) */
export async function GET() {
  const presets = await db
    .select({
      id: schema.sharedPresets.id,
      name: schema.sharedPresets.name,
      slug: schema.sharedPresets.slug,
      userId: schema.sharedPresets.userId,
      createdAt: schema.sharedPresets.createdAt,
      username: schema.users.username,
    })
    .from(schema.sharedPresets)
    .leftJoin(schema.users, eq(schema.sharedPresets.userId, schema.users.id))
    .orderBy(desc(schema.sharedPresets.createdAt))
    .limit(100);

  return NextResponse.json(presets);
}

/** POST /api/presets — share a preset */
export async function POST(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name, global: globalConfig, channels } = await req.json();
  if (!name || !globalConfig || !channels) {
    return NextResponse.json({ error: 'Missing name, global, or channels' }, { status: 400 });
  }

  const publicChannels = stripPrivateChannels(channels);
  const slug = generateSlug(name);

  const [preset] = await db
    .insert(schema.sharedPresets)
    .values({
      userId,
      name,
      slug,
      globalConfig,
      channelsConfig: publicChannels,
    })
    .returning();

  return NextResponse.json({ slug: preset.slug, id: preset.id });
}

/** DELETE /api/presets — delete own shared preset (pass ?slug=xxx) */
export async function DELETE(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 });

  const [preset] = await db
    .select()
    .from(schema.sharedPresets)
    .where(eq(schema.sharedPresets.slug, slug));

  if (!preset) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (preset.userId !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  await db.delete(schema.sharedPresets).where(eq(schema.sharedPresets.id, preset.id));
  return NextResponse.json({ ok: true });
}
