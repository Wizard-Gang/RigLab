// Local only: `npm run export:conformance` rewrites conformance/export, conformance/invalid and conformance/cases.json from
// conformance/library. The suite proves the committed files equal what this writes.
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const { module } = await runnerImport(new URL('../tests/conformance/build.ts', import.meta.url).pathname, { configFile: false, root, logLevel: 'error' });
try {
  for (const line of await module.writeConformance()) console.log(line);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
