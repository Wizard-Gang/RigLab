#!/usr/bin/env node
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VENDOR_DIR, validateVendorAt } from './hexframe-vendor.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failures = validateVendorAt(root);
if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`${VENDOR_DIR} matches its Hexframe pin byte-for-byte.`);
}
