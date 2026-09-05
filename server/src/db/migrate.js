import 'dotenv/config';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db } from './client.js';

await migrate(db, { migrationsFolder: './src/db/migrations' });
console.log('Migrations applied.');
process.exit(0);
