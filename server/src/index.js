import 'dotenv/config';
import Fastify from 'fastify';
import { authRoutes } from './auth/routes.js';
import { syncRoutes } from './sync/routes.js';

const app = Fastify({ logger: true });

app.get('/health', async () => ({ ok: true }));

await app.register(authRoutes);
await app.register(syncRoutes);

const port = Number(process.env.PORT || 3000);
app.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
});
