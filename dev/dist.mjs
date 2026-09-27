// Copy only what the site needs into dist/. Upload dist/, never the project folder:
// content/ holds private notes, and docs/, dev/ and tests/ are not part of the site.
import { cpSync, rmSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist');
const SHIP = ['index.html', 'keynote.html', 'css', 'js', 'fonts', 'assets'];

rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const item of SHIP) {
  cpSync(join(root, item), join(out, item), { recursive: true, filter: (src) => !src.endsWith('.DS_Store') });
}
let files = 0, bytes = 0;
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else { files++; bytes += st.size; }
  }
})(out);
console.log(`dist/ ready: ${files} files, ${(bytes / 1024).toFixed(0)} KB. Upload the contents of dist/ only.`);
