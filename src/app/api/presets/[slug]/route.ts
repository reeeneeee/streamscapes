import { db } from '@/db';
import * as schema from '@/db/schema';
import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

/** GET /api/presets/[slug] — load a shared preset by slug */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const [preset] = await db
    .select({
      id: schema.sharedPresets.id,
      name: schema.sharedPresets.name,
      slug: schema.sharedPresets.slug,
      globalConfig: schema.sharedPresets.globalConfig,
      channelsConfig: schema.sharedPresets.channelsConfig,
      createdAt: schema.sharedPresets.createdAt,
      username: schema.users.username,
    })
    .from(schema.sharedPresets)
    .leftJoin(schema.users, eq(schema.sharedPresets.userId, schema.users.id))
    .where(eq(schema.sharedPresets.slug, slug));

  if (!preset) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(preset);
}
