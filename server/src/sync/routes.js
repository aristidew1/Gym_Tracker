import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../auth/auth.js';

// Fastify preHandler: rejects with 401 unless Better Auth resolves a session
// from the request (bearer token via the `bearer` plugin, or a session
// cookie), and attaches the resolved userId onto the request.
async function requireAuth(request, reply) {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
  if (!session) {
    reply.code(401).send({ error: 'unauthenticated' });
    return;
  }
  request.userId = session.user.id;
}

// M1 scope: prove the auth + routing skeleton end-to-end. Always returns an
// empty pull regardless of what's pushed — no persistence, no merge logic yet.
// Real push/pull (per-entity upserts, LWW by updatedAt, tombstones) is M3.
export async function syncRoutes(app) {
  app.post('/sync', { preHandler: requireAuth }, async (request, reply) => {
    reply.send({
      syncedAt: new Date().toISOString(),
      changes: {
        workouts: [],
        programs: [],
        customExercises: [],
        supplements: [],
        supplementLog: [],
        settings: [],
        seenFlags: [],
      },
    });
  });
}
