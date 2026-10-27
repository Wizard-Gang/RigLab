// Local only: `npm run convert:parts -- <library-folder>` rewrites a library's pixel SVG cell art as riglab.part grids.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';

const folder = process.argv[2];
if (!folder) {
  console.error('usage: npm run convert:parts -- <library-folder>');
  process.exit(1);
}
const root = fileURLToPath(new URL('..', import.meta.url));
const { module } = await runnerImport(new URL('../src/library/convert.ts', import.meta.url).pathname, { configFile: false, root, logLevel: 'error' });
const report = module.convertLibraryFolder(resolve(folder));
for (const line of report.lines) (report.ok ? console.log : console.error)(line);
process.exitCode = report.ok ? 0 : 1;
