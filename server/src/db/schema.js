import { boolean, date, index, jsonb, numeric, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Auth tables below match what Better Auth's Drizzle adapter expects (see
// server/src/auth/auth.js, usePlural: true) — generated once with
// `npx @better-auth/cli generate` and hand-adjusted to use uuid ids (via the
// `generateId` override in auth.js) instead of plain text, so the per-user
// data tables further down can keep referencing user.id as a uuid.
export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey(),
  token: text('token').notNull().unique(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (table) => ([
  index('sessions_user_idx').on(table.userId),
]));

// Linked sign-in methods per user: one row per (provider, account) — the
// email/password credential is itself a row here (providerId: "credential")
// rather than living on the users table, per Better Auth's model.
export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  // The stable provider-side identity key (paired with accountId) — e.g.
  // "local:credential" for email/password, "local:oauth:google" for Google.
  issuer: text('issuer').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ([
  index('accounts_user_idx').on(table.userId),
]));

// Short-lived tokens for magic links, password reset, and email verification.
export const verifications = pgTable('verifications', {
  id: uuid('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (table) => ([
  index('verifications_identifier_idx').on(table.identifier),
]));

// Whole-row-replace, last-write-wins-by-updated_at entities. Each stores its
// full client-side record shape as JSONB rather than being column-mapped,
// since the client already edits these as complete objects (see
// models/workout-schema.js) and the server never needs to query inside them.
function replaceableEntity(name, extraColumns = {}) {
  return pgTable(name, {
    // Client-generated ids (e.g. "program_<uuid>", or time+random for
    // workouts) — not necessarily bare RFC4122 uuids, hence text not uuid.
    id: text('id').notNull(),
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
  id: text('id').notNull(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  muscleCategory: text('muscle_category'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => ([
  primaryKey({ columns: [table.userId, table.id] }),
]));

export const supplements = pgTable('supplements', {
  id: text('id').notNull(),
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
  supplementId: text('supplement_id').notNull(),
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
