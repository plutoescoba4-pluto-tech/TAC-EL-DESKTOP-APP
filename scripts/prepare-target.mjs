// Copies the right web-app manifest into public/ before a build:   node scripts/prepare-target.mjs mobile|web
import { copyFileSync, existsSync } from 'node:fs';

const target = process.argv[2];
if (!['mobile', 'web'].includes(target)) {
  console.error('Usage: node scripts/prepare-target.mjs mobile|web');
  process.exit(1);
}
const from = `targets/${target}/manifest.webmanifest`;
if (!existsSync(from)) {
  console.error(`Missing ${from}`);
  process.exit(1);
}
copyFileSync(from, 'public/manifest.webmanifest');
console.log(`Prepared the "${target}" app.`);
