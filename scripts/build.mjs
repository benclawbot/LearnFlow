import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');
const required = [
  'public/index.html',
  'public/styles.css',
  'src/app.js',
  'src/tree.js',
  'src/report.js',
  'src/api.js',
  'src/data.js',
  'api/explore.mjs',
  'api/analyze.mjs',
  'api/health.mjs',
  'server/index.mjs',
  'server/minimax.mjs',
  'package.json',
  '.env.example',
  'README.md'
];

for (const file of required) {
  if (!existsSync(path.join(root, file))) throw new Error(`Missing required file: ${file}`);
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(path.join(root, 'public'), dist, { recursive: true });
await cp(path.join(root, 'src'), path.join(dist, 'src'), { recursive: true });
await cp(path.join(root, 'README.md'), path.join(dist, 'README.md'));
await cp(path.join(root, 'package.json'), path.join(dist, 'package.json'));
await cp(path.join(root, '.env.example'), path.join(dist, '.env.example'));

const manifest = {
  name: 'LearnFlow MiniMax M3 build',
  generatedAt: new Date().toISOString(),
  entry: 'index.html',
  staticRoot: 'dist',
  model: 'MiniMax-M3',
  baseUrl: 'https://api.minimax.io/v1',
  output: 'Printable HTML report'
};
await writeFile(path.join(dist, 'build-manifest.json'), JSON.stringify(manifest, null, 2));

const html = await readFile(path.join(dist, 'index.html'), 'utf8');
if (!html.includes('/src/app.js')) throw new Error('index.html does not reference /src/app.js');
console.log(`Build complete: ${path.relative(root, dist)}`);
console.log(`Validated ${required.length} required files.`);
