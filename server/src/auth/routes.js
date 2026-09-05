import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { hashPassword, verifyPassword } from './password.js';
import { createSession, deleteSession, requireAuth } from './session.js';

const credentialsSchema = {
  body: {
    type: 'object',
    required: ['email', 'password'],
    properties: {
      email: { type: 'string', format: 'email', maxLength: 255 },
      password: { type: 'string', minLength: 8, maxLength: 200 },
    },
  },
};

export async function authRoutes(app) {
  app.post('/auth/register', { schema: credentialsSchema }, async (request, reply) => {
    const email = request.body.email.trim().toLowerCase();
    const { password } = request.body;

    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing) {
      reply.code(409).send({ error: 'email_already_registered' });
      return;
    }

    const passwordHash = await hashPassword(password);
    const [user] = await db.insert(users).values({ email, passwordHash }).returning({ id: users.id });
    const session = await createSession(user.id);
    reply.code(201).send({ token: session.token, expiresAt: session.expiresAt });
  });

  app.post('/auth/login', { schema: credentialsSchema }, async (request, reply) => {
    const email = request.body.email.trim().toLowerCase();
    const { password } = request.body;

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user || !(await verifyPassword(user.passwordHash, password))) {
      reply.code(401).send({ error: 'invalid_credentials' });
      return;
    }

    const session = await createSession(user.id);
    reply.send({ token: session.token, expiresAt: session.expiresAt });
  });

  app.post('/auth/logout', { preHandler: requireAuth }, async (request, reply) => {
    await deleteSession(request.sessionToken);
    reply.code(204).send();
  });
}
