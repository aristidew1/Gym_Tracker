import { and, eq, gt, sql } from 'drizzle-orm';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../auth/auth.js';
import { db } from '../db/client.js';
import { programs, workouts } from '../db/schema.js';

const MAX_RECORDS_PER_ENTITY = 1000;

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

function isValidRecord(record) {
  return record
    && typeof record === 'object'
    && typeof record.id === 'string' && record.id.trim().length > 0
    && typeof record.updatedAt === 'string' && !Number.isNaN(Date.parse(record.updatedAt))
    && (record.deletedAt === null || record.deletedAt === undefined || (typeof record.deletedAt === 'string' && !Number.isNaN(Date.parse(record.deletedAt))))
    && (record.data === null || typeof record.data === 'object');
}

// M2 scope: real push/pull for workouts + programs (whole-record JSONB,
// last-write-wins by updatedAt). customExercises/supplements/supplementLog/
// settings/seenFlags stay stubbed empty until M3 reuses this same protocol.
//
// Push: upsert each record with `WHERE table.updated_at < excluded.updated_at`
// — a stale write (one that would replace a row already newer) is silently
// dropped rather than applied, which is last-write-wins expressed as a single
// conditional upsert. Pull: everything changed (tombstones included) since
// the client's `since` cursor.
async function upsertReplaceable(tx, table, userId, records) {
  if (records.length === 0) return;
  const rows = records.map((record) => ({
    id: record.id,
    userId,
    data: record.data ?? {},
    updatedAt: new Date(record.updatedAt),
    deletedAt: record.deletedAt ? new Date(record.deletedAt) : null,
  }));
  await tx.insert(table).values(rows).onConflictDoUpdate({
    target: [table.userId, table.id],
    set: {
      data: sql`excluded.data`,
      updatedAt: sql`excluded.updated_at`,
      deletedAt: sql`excluded.deleted_at`,
    },
    where: sql`${table.updatedAt} < excluded.updated_at`,
  });
}

async function pullReplaceable(tx, table, userId, since) {
  const rows = await tx.select().from(table).where(
    since ? and(eq(table.userId, userId), gt(table.updatedAt, new Date(since))) : eq(table.userId, userId),
  );
  return rows.map((row) => ({
    id: row.id,
    data: row.data,
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
  }));
}

export async function syncRoutes(app) {
  app.post('/sync', { preHandler: requireAuth }, async (request, reply) => {
    const body = request.body || {};
    const since = body.since && !Number.isNaN(Date.parse(body.since)) ? body.since : null;
    const pushedWorkouts = Array.isArray(body.changes?.workouts) ? body.changes.workouts : [];
    const pushedPrograms = Array.isArray(body.changes?.programs) ? body.changes.programs : [];

    if (pushedWorkouts.length > MAX_RECORDS_PER_ENTITY || pushedPrograms.length > MAX_RECORDS_PER_ENTITY) {
      reply.code(400).send({ error: 'too_many_records' });
      return;
    }
    if (![...pushedWorkouts, ...pushedPrograms].every(isValidRecord)) {
      reply.code(400).send({ error: 'invalid_record' });
      return;
    }

    const userId = request.userId;
    const [workoutChanges, programChanges] = await db.transaction(async (tx) => {
      await upsertReplaceable(tx, workouts, userId, pushedWorkouts);
      await upsertReplaceable(tx, programs, userId, pushedPrograms);
      return Promise.all([
        pullReplaceable(tx, workouts, userId, since),
        pullReplaceable(tx, programs, userId, since),
      ]);
    });

    reply.send({
      syncedAt: new Date().toISOString(),
      changes: {
        workouts: workoutChanges,
        programs: programChanges,
        customExercises: [],
        supplements: [],
        supplementLog: [],
        settings: [],
        seenFlags: [],
      },
    });
  });
}
