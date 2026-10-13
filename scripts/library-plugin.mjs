// Vite's config loader runs this file natively, and native loading cannot follow the TypeScript plugin's
// extensionless imports, so the plugin is imported through Vite's module runner instead.
import { runnerImport } from 'vite';

const PLUGIN = new URL('../src/library/plugin.ts', import.meta.url).pathname;

export async function riglabLibrary(options) {
  const { module } = await runnerImport(PLUGIN, { configFile: false, root: options.root, logLevel: 'error' });
  return module.riglabLibrary(options);
}
