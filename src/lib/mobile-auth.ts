import { jwtVerify } from 'jose';
import { NextRequest } from 'next/server';

const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET!);

interface MobileUser {
  id: string;
  name?: string;
  email?: string;
  image?: string;
}

/**
 * Verify the Bearer token from iOS mobile auth.
 * Returns the user payload or null if invalid/expired.
 */
export async function getMobileUser(req: NextRequest): Promise<MobileUser | null> {
  const header = req.headers.get('Authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice(7);
  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (!payload.sub) return null;
    return {
      id: payload.sub,
      name: payload.name as string | undefined,
      email: payload.email as string | undefined,
      image: payload.image as string | undefined,
    };
  } catch {
    return null;
  }
}
