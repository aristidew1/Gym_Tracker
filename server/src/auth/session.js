import crypto from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import { db } from '../db/client.js';
import { sessions } from '../db/schema.js';

const SESSION_TTL_MS = Number(process.env.SESSION_TTL_DAYS || 90) * 24 * 60 * 60 * 1000;

export async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ token, userId, expiresAt });
  return { token, expiresAt };
}

export async function deleteSession(token) {
  await db.delete(sessions).where(eq(sessions.token, token));
}

async function resolveSession(token) {
  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.token, token), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!session) return null;

  // Sliding expiry: touch the session forward on use so an active user is
  // never logged out mid-use, while an abandoned token still expires.
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.update(sessions).set({ expiresAt }).where(eq(sessions.token, token));
  return session;
}

// Fastify preHandler: rejects with 401 unless a valid, unexpired bearer token
// is present, and attaches the resolved userId onto the request.
export async function requireAuth(request, reply) {
  const header = request.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  if (!token) {
    reply.code(401).send({ error: 'missing_token' });
    return;
  }

  const session = await resolveSession(token);
  if (!session) {
    reply.code(401).send({ error: 'invalid_or_expired_token' });
    return;
  }

  request.userId = session.userId;
  request.sessionToken = token;
}
