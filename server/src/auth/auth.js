import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer, magicLink } from 'better-auth/plugins';
import { db } from '../db/client.js';
import { sendEmail } from '../email/send-email.js';

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg', usePlural: true }),
  // Keeps ids as real Postgres uuids so per-user data tables (workouts,
  // programs, ...) can reference user.id with a plain uuid foreign key.
  advanced: {
    database: { generateId: () => crypto.randomUUID() },
  },
  trustedOrigins: (process.env.TRUSTED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url }) => sendEmail({
      to: user.email,
      subject: 'Réinitialise ton mot de passe',
      html: `<a href="${url}">Réinitialiser mon mot de passe</a>`,
    }),
  },
  socialProviders: {
    google: {
      clientId: [
        process.env.GOOGLE_CLIENT_ID_WEB,
        process.env.GOOGLE_CLIENT_ID_ANDROID,
        process.env.GOOGLE_CLIENT_ID_IOS,
      ].filter(Boolean),
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    },
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => sendEmail({
        to: email,
        subject: 'Ton lien de connexion',
        html: `<a href="${url}">Se connecter</a>`,
      }),
    }),
    bearer(),
  ],
});
