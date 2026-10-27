// `npm run migrate:rig -- <library-folder>`: rewrite a library's riglab.rig version 1 as version 2, with its depth
// profiles' resolved paint order.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { RIG_VERSION, validateRig, withPaintOrder } from "../format/rig";
import type { RigLabRig } from "../format/rig";
import { CONFIG_FILE, parseConfig } from "./config";
import type { LibraryFiles } from "./files";
import { readLibraryFolder } from "./folder";

export interface RigMigration {
  /** Folder-relative path and text to write, or null when the rig is already version 2. */
  readonly write: { readonly path: string; readonly text: string } | null;
  readonly errors: readonly string[];
}

/** The rig line's file as version 2, or errors when it is not a valid version 1 rig with resolvable depth profiles. */
export function migrateRig(files: LibraryFiles): RigMigration {
  const config = files[CONFIG_FILE] === undefined ? null : parseConfig(files[CONFIG_FILE]);
  if (!config?.ok) return { write: null, errors: [`${CONFIG_FILE}: is missing or does not parse; run npm run check:library`] };
  const entry = config.value.find((candidate) => candidate.kind === "rig");
  const text = entry && files[entry.path];
  if (!entry || text === undefined) return { write: null, errors: [`${entry?.path ?? CONFIG_FILE}: has no rig file to migrate`] };
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { write: null, errors: [`${entry.path}: is not valid JSON`] };
  }
  if (value.version === RIG_VERSION) return { write: null, errors: [] };
  if (value.version !== 1) return { write: null, errors: [`${entry.path}: $.version: must be 1 to migrate`] };
  let migrated: RigLabRig;
  try {
    migrated = withPaintOrder({ ...value, version: RIG_VERSION } as unknown as RigLabRig);
  } catch (error) {
    return { write: null, errors: [`${entry.path}: ${(error as Error).message}`] };
  }
  const result = validateRig(migrated);
  if (!result.ok) return { write: null, errors: result.errors.map((error) => `${entry.path}: ${error}`) };
  return { write: { path: entry.path, text: `${JSON.stringify(migrated, null, 2)}\n` }, errors: [] };
}

/** Migrate `dir`'s rig in place, or change nothing when it cannot be migrated. */
export function migrateLibraryFolder(dir: string): { readonly ok: boolean; readonly lines: readonly string[] } {
  const read = readLibraryFolder(dir);
  if (read.errors.length) return { ok: false, lines: [`${dir} could not be read:`, ...read.errors] };
  const migration = migrateRig(read.files);
  if (migration.errors.length) return { ok: false, lines: [`${dir}: nothing was migrated:`, ...migration.errors] };
  if (!migration.write) return { ok: true, lines: [`${dir}: the rig is already riglab.rig version ${RIG_VERSION}.`] };
  writeFileSync(join(dir, migration.write.path), migration.write.text);
  return { ok: true, lines: [`${dir}: migrated ${migration.write.path} to riglab.rig version ${RIG_VERSION} with its paint order.`] };
}
