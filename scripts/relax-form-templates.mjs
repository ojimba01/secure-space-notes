// Take the length caps and fixed font sizes off the blank templates' big boxes.
//
// The Client Intake template was generated with `/MaxLen 100` on every text
// field, which on its tall answer boxes (questions 10, 15, 17, 23, 25, 28, 30,
// 53 and Additional Notes) stopped typing after about one line. The app relaxes
// whatever it opens at runtime — see src/lib/pdfFormFields.ts — but the blank
// templates are also downloaded and filled in outside the app, so they are
// fixed at the source too.
//
// Run it after replacing or rebuilding a template:
//
//   node scripts/relax-form-templates.mjs
//
// It rewrites public/form-templates/*.pdf in place and prints what it changed.
import { readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { PDFDocument } from 'pdf-lib';

const TEMPLATE_DIR = 'public/form-templates';

// The rule itself lives with the app, so the templates and the viewer can
// never drift apart. It is TypeScript, so it goes through esbuild first —
// landing inside node_modules, where its own `pdf-lib` import still resolves
// to the one copy this script is holding documents from.
const compiled = 'node_modules/.relax-form-templates.mjs';
await build({
  stdin: {
    contents: `export { relaxMultilineFields } from './src/lib/pdfFormFields';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  outfile: compiled,
  platform: 'node',
  format: 'esm',
  external: ['pdf-lib'],
});
const { relaxMultilineFields } = await import(pathToFileURL(compiled).href);
rmSync(compiled);

for (const name of readdirSync(TEMPLATE_DIR).filter((f) => f.endsWith('.pdf')).sort()) {
  const path = join(TEMPLATE_DIR, name);
  const doc = await PDFDocument.load(readFileSync(path), { ignoreEncryption: true });
  const changed = relaxMultilineFields(doc);
  if (!changed) {
    console.log(`${name}: already fine`);
    continue;
  }
  // Saving without updateFieldAppearances: pdf-lib would otherwise redraw the
  // fields it just touched and bake a size back into the auto-sized font.
  writeFileSync(path, await doc.save({ updateFieldAppearances: false }));
  console.log(`${name}: relaxed ${changed} multi-line field${changed === 1 ? '' : 's'}`);
}
