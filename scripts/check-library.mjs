// Local only, never part of `npm run check`: validate a library folder (default: the one `npm start` would read).
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const { module } = await runnerImport(new URL('../src/library/check.ts', import.meta.url).pathname, { configFile: false, root, logLevel: 'error' });
const report = module.checkLibraryFolder(root, process.argv[2]);
for (const line of report.lines) (report.ok ? console.log : console.error)(line);
process.exitCode = report.ok ? 0 : 1;
