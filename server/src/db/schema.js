import { date, index, jsonb, numeric, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable('sessions', {
  token: text('token').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

// Whole-row-replace, last-write-wins-by-updated_at entities. Each stores its
// full client-side record shape as JSONB rather than being column-mapped,
// since the client already edits these as complete objects (see
// models/workout-schema.js) and the server never needs to query inside them.
function replaceableEntity(name, extraColumns = {}) {
  return pgTable(name, {
    id: uuid('id').notNull(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    data: jsonb('data').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...extraColumns,
  }, (table) => ([
    primaryKey({ columns: [table.userId, table.id] }),
    index(`${name}_user_updated_idx`).on(table.userId, table.updatedAt),
  ]));
}

export const workouts = replaceableEntity('workouts');
export const programs = replaceableEntity('programs');

export const customExercises = pgTable('custom_exercises', {
  id: uuid('id').notNull(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  muscleCategory: text('muscle_category'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => ([
  primaryKey({ columns: [table.userId, table.id] }),
]));

export const supplements = pgTable('supplements', {
  id: uuid('id').notNull(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  dose: numeric('dose'),
  unit: text('unit'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => ([
  primaryKey({ columns: [table.userId, table.id] }),
]));

// One row per (date, supplement) taken, not a JSON array column — this is
// what makes it naturally union-mergeable: two devices marking different
// supplements taken the same day never conflict, they just each upsert their
// own row. "Untaken" tombstones the row rather than hard-deleting it.
export const supplementLog = pgTable('supplement_log', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  logDate: date('log_date').notNull(),
  supplementId: uuid('supplement_id').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => ([
  primaryKey({ columns: [table.userId, table.logDate, table.supplementId] }),
]));

// Scalar preferences (theme, language, onboarding flags, ...) — last-write-wins per key.
export const settings = pgTable('settings', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}, (table) => ([
  primaryKey({ columns: [table.userId, table.key] }),
]));

// Insert-only union-merge set: seen coachmarks / seen program notes. A tip
// must never "un-become seen" just because an older device's data merges in,
// so there is deliberately no deletedAt here.
export const seenFlags = pgTable('seen_flags', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  flagType: text('flag_type').notNull(),
  flagId: text('flag_id').notNull(),
  seenAt: timestamp('seen_at', { withTimezone: true }).notNull(),
}, (table) => ([
  primaryKey({ columns: [table.userId, table.flagType, table.flagId] }),
]));
