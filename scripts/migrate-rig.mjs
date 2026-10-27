// Local only: `npm run migrate:rig -- <library-folder>` rewrites a library's riglab.rig version 1 as version 2.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';

const folder = process.argv[2];
if (!folder) {
  console.error('usage: npm run migrate:rig -- <library-folder>');
  process.exit(1);
}
const root = fileURLToPath(new URL('..', import.meta.url));
const { module } = await runnerImport(new URL('../src/library/migrate.ts', import.meta.url).pathname, { configFile: false, root, logLevel: 'error' });
const report = module.migrateLibraryFolder(resolve(folder));
for (const line of report.lines) (report.ok ? console.log : console.error)(line);
process.exitCode = report.ok ? 0 : 1;
