import NextAuth from 'next-auth';
import Apple from 'next-auth/providers/apple';
import Google from 'next-auth/providers/google';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { db } from '@/db';
import { eq } from 'drizzle-orm';
import * as schema from '@/db/schema';

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: schema.users,
    accountsTable: schema.accounts,
    sessionsTable: schema.sessions,
    verificationTokensTable: schema.verificationTokens,
  }),
  providers: [Apple, Google],
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      if (user?.image) session.user.image = user.image;
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      // Auto-assign a default username like "user1234ab"
      if (!user.id) return;
      const suffix = user.id.replace(/-/g, '').slice(0, 6);
      const username = `user${suffix}`;
      try {
        await db.update(schema.users).set({ username }).where(eq(schema.users.id, user.id));
      } catch {
        // Username collision — leave null, user can set manually
      }
    },
  },
});
