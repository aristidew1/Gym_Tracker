import { and, eq, gt, sql } from 'drizzle-orm';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../auth/auth.js';
import { db } from '../db/client.js';
import {
  customExercises,
  programs,
  seenFlags,
  settings,
  supplementLog,
  supplements,
  workouts,
} from '../db/schema.js';

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

function isIsoDate(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isOptionalIsoDate(value) {
  return value === null || value === undefined || isIsoDate(value);
}

function isValidReplaceableRecord(record) {
  return record
    && typeof record === 'object'
    && typeof record.id === 'string' && record.id.trim().length > 0
    && isIsoDate(record.updatedAt)
    && isOptionalIsoDate(record.deletedAt)
    && (record.data === null || typeof record.data === 'object');
}

function isValidCustomExerciseRecord(record) {
  return record
    && typeof record === 'object'
    && typeof record.id === 'string' && record.id.trim().length > 0
    && typeof record.name === 'string' && record.name.trim().length > 0
    && (record.muscleCategory === null || record.muscleCategory === undefined || typeof record.muscleCategory === 'string')
    && isIsoDate(record.updatedAt)
    && isOptionalIsoDate(record.deletedAt);
}

function isValidSupplementRecord(record) {
  return record
    && typeof record === 'object'
    && typeof record.id === 'string' && record.id.trim().length > 0
    && typeof record.name === 'string' && record.name.trim().length > 0
    && (record.dose === null || record.dose === undefined || typeof record.dose === 'string' || typeof record.dose === 'number')
    && (record.unit === null || record.unit === undefined || typeof record.unit === 'string')
    && isIsoDate(record.createdAt)
    && isIsoDate(record.updatedAt)
    && isOptionalIsoDate(record.deletedAt);
}

function isValidSupplementLogRecord(record) {
  return record
    && typeof record === 'object'
    && typeof record.logDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(record.logDate)
    && typeof record.supplementId === 'string' && record.supplementId.trim().length > 0
    && isIsoDate(record.updatedAt)
    && isOptionalIsoDate(record.deletedAt);
}

function isValidSettingRecord(record) {
  return record
    && typeof record === 'object'
    && typeof record.key === 'string' && record.key.trim().length > 0
    && record.value !== undefined
    && isIsoDate(record.updatedAt);
}

function isValidSeenFlagRecord(record) {
  return record
    && typeof record === 'object'
    && typeof record.flagType === 'string' && record.flagType.trim().length > 0
    && typeof record.flagId === 'string' && record.flagId.trim().length > 0
    && isIsoDate(record.seenAt);
}

// M2/M3 scope: real push/pull for every entity, whole-record last-write-wins
// by updatedAt except seenFlags (insert-only union merge — a flag never
// un-becomes seen, see insertSeenFlags below).
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

async function upsertCustomExercises(tx, userId, records) {
  if (records.length === 0) return;
  const rows = records.map((record) => ({
    id: record.id,
    userId,
    name: record.name,
    muscleCategory: record.muscleCategory ?? null,
    updatedAt: new Date(record.updatedAt),
    deletedAt: record.deletedAt ? new Date(record.deletedAt) : null,
  }));
  await tx.insert(customExercises).values(rows).onConflictDoUpdate({
    target: [customExercises.userId, customExercises.id],
    set: {
      name: sql`excluded.name`,
      muscleCategory: sql`excluded.muscle_category`,
      updatedAt: sql`excluded.updated_at`,
      deletedAt: sql`excluded.deleted_at`,
    },
    where: sql`${customExercises.updatedAt} < excluded.updated_at`,
  });
}

async function pullCustomExercises(tx, userId, since) {
  const rows = await tx.select().from(customExercises).where(
    since ? and(eq(customExercises.userId, userId), gt(customExercises.updatedAt, new Date(since))) : eq(customExercises.userId, userId),
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    muscleCategory: row.muscleCategory,
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
  }));
}

async function upsertSupplements(tx, userId, records) {
  if (records.length === 0) return;
  const rows = records.map((record) => ({
    id: record.id,
    userId,
    name: record.name,
    dose: record.dose === null || record.dose === undefined || record.dose === '' ? null : String(record.dose),
    unit: record.unit ?? null,
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
    deletedAt: record.deletedAt ? new Date(record.deletedAt) : null,
  }));
  await tx.insert(supplements).values(rows).onConflictDoUpdate({
    target: [supplements.userId, supplements.id],
    set: {
      name: sql`excluded.name`,
      dose: sql`excluded.dose`,
      unit: sql`excluded.unit`,
      updatedAt: sql`excluded.updated_at`,
      deletedAt: sql`excluded.deleted_at`,
    },
    where: sql`${supplements.updatedAt} < excluded.updated_at`,
  });
}

async function pullSupplements(tx, userId, since) {
  const rows = await tx.select().from(supplements).where(
    since ? and(eq(supplements.userId, userId), gt(supplements.updatedAt, new Date(since))) : eq(supplements.userId, userId),
  );
  // The client stores createdAt as a plain "YYYY-MM-DD" day (see
  // supplements.js's today()), not a full timestamp — normalize the
  // timestamptz column back down to that shape so a round trip through the
  // server doesn't change how the client compares it against other dates.
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    dose: row.dose,
    unit: row.unit,
    createdAt: row.createdAt.toISOString().slice(0, 10),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
  }));
}

async function upsertSupplementLog(tx, userId, records) {
  if (records.length === 0) return;
  const rows = records.map((record) => ({
    userId,
    logDate: record.logDate,
    supplementId: record.supplementId,
    updatedAt: new Date(record.updatedAt),
    deletedAt: record.deletedAt ? new Date(record.deletedAt) : null,
  }));
  await tx.insert(supplementLog).values(rows).onConflictDoUpdate({
    target: [supplementLog.userId, supplementLog.logDate, supplementLog.supplementId],
    set: {
      updatedAt: sql`excluded.updated_at`,
      deletedAt: sql`excluded.deleted_at`,
    },
    where: sql`${supplementLog.updatedAt} < excluded.updated_at`,
  });
}

async function pullSupplementLog(tx, userId, since) {
  const rows = await tx.select().from(supplementLog).where(
    since ? and(eq(supplementLog.userId, userId), gt(supplementLog.updatedAt, new Date(since))) : eq(supplementLog.userId, userId),
  );
  return rows.map((row) => ({
    logDate: row.logDate,
    supplementId: row.supplementId,
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
  }));
}

async function upsertSettings(tx, userId, records) {
  if (records.length === 0) return;
  const rows = records.map((record) => ({
    userId,
    key: record.key,
    value: record.value,
    updatedAt: new Date(record.updatedAt),
  }));
  await tx.insert(settings).values(rows).onConflictDoUpdate({
    target: [settings.userId, settings.key],
    set: {
      value: sql`excluded.value`,
      updatedAt: sql`excluded.updated_at`,
    },
    where: sql`${settings.updatedAt} < excluded.updated_at`,
  });
}

async function pullSettings(tx, userId, since) {
  const rows = await tx.select().from(settings).where(
    since ? and(eq(settings.userId, userId), gt(settings.updatedAt, new Date(since))) : eq(settings.userId, userId),
  );
  return rows.map((row) => ({ key: row.key, value: row.value, updatedAt: row.updatedAt.toISOString() }));
}

// A seen flag never un-becomes seen, so a push is a pure insert: the first
// device to report a given (flagType, flagId) wins its seenAt, and every
// later push of the same pair is a harmless no-op rather than a conflict.
async function insertSeenFlags(tx, userId, records) {
  if (records.length === 0) return;
  const rows = records.map((record) => ({
    userId,
    flagType: record.flagType,
    flagId: record.flagId,
    seenAt: new Date(record.seenAt),
  }));
  await tx.insert(seenFlags).values(rows).onConflictDoNothing({
    target: [seenFlags.userId, seenFlags.flagType, seenFlags.flagId],
  });
}

async function pullSeenFlags(tx, userId, since) {
  const rows = await tx.select().from(seenFlags).where(
    since ? and(eq(seenFlags.userId, userId), gt(seenFlags.seenAt, new Date(since))) : eq(seenFlags.userId, userId),
  );
  return rows.map((row) => ({ flagType: row.flagType, flagId: row.flagId, seenAt: row.seenAt.toISOString() }));
}

export async function syncRoutes(app) {
  app.post('/sync', { preHandler: requireAuth }, async (request, reply) => {
    const body = request.body || {};
    const since = body.since && !Number.isNaN(Date.parse(body.since)) ? body.since : null;
    const changes = body.changes || {};
    const pushed = {
      workouts: Array.isArray(changes.workouts) ? changes.workouts : [],
      programs: Array.isArray(changes.programs) ? changes.programs : [],
      customExercises: Array.isArray(changes.customExercises) ? changes.customExercises : [],
      supplements: Array.isArray(changes.supplements) ? changes.supplements : [],
      supplementLog: Array.isArray(changes.supplementLog) ? changes.supplementLog : [],
      settings: Array.isArray(changes.settings) ? changes.settings : [],
      seenFlags: Array.isArray(changes.seenFlags) ? changes.seenFlags : [],
    };

    if (Object.values(pushed).some((records) => records.length > MAX_RECORDS_PER_ENTITY)) {
      reply.code(400).send({ error: 'too_many_records' });
      return;
    }
    const validators = {
      workouts: isValidReplaceableRecord,
      programs: isValidReplaceableRecord,
      customExercises: isValidCustomExerciseRecord,
      supplements: isValidSupplementRecord,
      supplementLog: isValidSupplementLogRecord,
      settings: isValidSettingRecord,
      seenFlags: isValidSeenFlagRecord,
    };
    const hasInvalidRecord = Object.entries(pushed).some(
      ([entity, records]) => !records.every(validators[entity]),
    );
    if (hasInvalidRecord) {
      reply.code(400).send({ error: 'invalid_record' });
      return;
    }

    const userId = request.userId;
    const [
      workoutChanges,
      programChanges,
      customExerciseChanges,
      supplementChanges,
      supplementLogChanges,
      settingsChanges,
      seenFlagChanges,
    ] = await db.transaction(async (tx) => {
      await upsertReplaceable(tx, workouts, userId, pushed.workouts);
      await upsertReplaceable(tx, programs, userId, pushed.programs);
      await upsertCustomExercises(tx, userId, pushed.customExercises);
      await upsertSupplements(tx, userId, pushed.supplements);
      await upsertSupplementLog(tx, userId, pushed.supplementLog);
      await upsertSettings(tx, userId, pushed.settings);
      await insertSeenFlags(tx, userId, pushed.seenFlags);
      return Promise.all([
        pullReplaceable(tx, workouts, userId, since),
        pullReplaceable(tx, programs, userId, since),
        pullCustomExercises(tx, userId, since),
        pullSupplements(tx, userId, since),
        pullSupplementLog(tx, userId, since),
        pullSettings(tx, userId, since),
        pullSeenFlags(tx, userId, since),
      ]);
    });

    reply.send({
      syncedAt: new Date().toISOString(),
      changes: {
        workouts: workoutChanges,
        programs: programChanges,
        customExercises: customExerciseChanges,
        supplements: supplementChanges,
        supplementLog: supplementLogChanges,
        settings: settingsChanges,
        seenFlags: seenFlagChanges,
      },
    });
  });
}
