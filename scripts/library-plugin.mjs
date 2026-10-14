// Vite's config loader runs this file natively, and native loading cannot follow the TypeScript plugin's
// extensionless imports, so the plugin is imported through Vite's module runner instead. Vite restarts only for files
// its config loader read, so the plugin gets the files it was imported from and restarts the dev server itself.
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';

const PLUGIN = fileURLToPath(new URL('../src/library/plugin.ts', import.meta.url));

export async function riglabLibrary(options) {
  const { module, dependencies } = await runnerImport(PLUGIN, { configFile: false, root: options.root, logLevel: 'error' });
  // `dependencies` leaves out the module runnerImport imported.
  return module.riglabLibrary({ ...options, sources: [PLUGIN, ...dependencies] });
}
