import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { checkLiteralBashRuns, literalRunBlocks, workflowPaths } from '../../scripts/check-workflow-shell.mjs';

test('workflow shell checker catches the missing publish-job fi', () => {
  const broken = 'steps:\n  - run: |\n      if [ -n "$EXPECTED_SHA" ]; then\n        [ "$(git rev-parse HEAD)" = "$EXPECTED_SHA" ]\n';
  assert.equal(literalRunBlocks(broken).length, 1);
  assert.match(checkLiteralBashRuns(broken).join('\n'), /unexpected end of file/);
  assert.deepEqual(checkLiteralBashRuns(`${broken}      fi\n`), []);
});

test('every committed workflow has valid literal Bash blocks', () => {
  const paths = workflowPaths();
  assert.deepEqual(paths, ['change.yml', 'gate.yml', 'release-cutter.yml', 'release.yml', 'verify.yml'].map((name) => `.github/workflows/${name}`));
  assert.ok(literalRunBlocks(readFileSync(new URL('../../.github/workflows/release.yml', import.meta.url), 'utf8')).length > 0);
  for (const path of paths) {
    assert.deepEqual(checkLiteralBashRuns(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')), [], path);
  }
});
