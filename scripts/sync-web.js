import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const webRoot = resolve(root, 'www');
const files = [
  'app.js', 'calendar.js', 'chart.umd.min.js', 'data.js', 'i18n.js', 'index.css', 'index.html',
  'notifications.js', 'programs.js', 'stats.js', 'storage.js', 'supplements.js', 'sw.js',
];
const directories = ['data', 'models', 'services'];

await mkdir(webRoot, { recursive: true });
await Promise.all(files.map((file) => cp(resolve(root, file), resolve(webRoot, file))));
await Promise.all(directories.map(async (directory) => {
  const target = resolve(webRoot, directory);
  await rm(target, { recursive: true, force: true });
  await cp(resolve(root, directory), target, { recursive: true });
}));

console.log('www synchronisé depuis les sources racines.');
