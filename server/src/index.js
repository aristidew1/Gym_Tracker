import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from './auth/auth.js';
import { syncRoutes } from './sync/routes.js';

const app = Fastify({ logger: true });

// The web app and the Capacitor app run on a different origin than this API
// (custom domain vs. https://localhost / capacitor://localhost), and the
// bearer/cookie handoff in /auth/complete relies on credentialed requests, so
// both need to be explicitly trusted here — same list as Better Auth's own
// trustedOrigins.
const trustedOrigins = (process.env.TRUSTED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
await app.register(cors, { origin: trustedOrigins, credentials: true });

app.get('/health', async () => ({ ok: true }));

// Mounts Better Auth's own routes (sign-up, sign-in, sign-out, magic link,
// Google sign-in, session lookup, ...) under /api/auth/*. This is the
// integration pattern documented by Better Auth for non-Express Node
// frameworks: convert the Fastify request to a standard Fetch API Request and
// hand it to auth.handler.
app.route({
  method: ['GET', 'POST'],
  url: '/api/auth/*',
  async handler(request, reply) {
    const url = new URL(request.url, `${request.protocol}://${request.headers.host}`);
    const req = new Request(url, {
      method: request.method,
      headers: fromNodeHeaders(request.headers),
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : JSON.stringify(request.body),
    });

    const response = await auth.handler(req);
    reply.status(response.status);
    response.headers.forEach((value, key) => reply.header(key, value));
    reply.send(response.body ? await response.text() : null);
  },
});

// Landing route for flows that end in a browser redirect with a session
// cookie (magic link, web OAuth) rather than a JSON response (email/password
// sign-in): our own origin can read that cookie, so it hands the session
// token back to the client as a query param on `target` — either the web
// app's URL, or the `gymtracker://auth-callback` custom scheme so a native
// app reopens without needing Firebase-style Dynamic Links / verified App
// Links. `target` is restricted to trusted destinations to avoid becoming an
// open redirect.
const ALLOWED_TARGETS = ['gymtracker://', ...trustedOrigins];

function parseCookie(header, name) {
  if (!header) return null;
  const match = header.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  if (!match) return null;
  const value = decodeURIComponent(match.slice(name.length + 1));
  return value.split('.')[0] || null;
}

app.get('/auth/complete', async (request, reply) => {
  const target = request.query.target;
  if (!target || !ALLOWED_TARGETS.some((allowed) => target.startsWith(allowed))) {
    reply.code(400).send({ error: 'invalid_target' });
    return;
  }

  const token = parseCookie(request.headers.cookie, 'better-auth.session_token');
  if (!token) {
    reply.code(401).send({ error: 'no_session' });
    return;
  }

  const separator = target.includes('?') ? '&' : '?';
  reply.redirect(`${target}${separator}token=${encodeURIComponent(token)}`);
});

await app.register(syncRoutes);

const port = Number(process.env.PORT || 3000);
app.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
});
