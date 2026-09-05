import { requireAuth } from '../auth/session.js';

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
