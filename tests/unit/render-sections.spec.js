// Every dashboard section must render with fixture data. See tests/render/run.mjs.
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

test('every dashboard section renders with fixture data', () => {
  const root = resolve(__dirname, '../..');
  let out = '';
  try {
    out = execFileSync(process.execPath, ['tests/render/run.mjs'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    out = (e.stdout || '') + (e.stderr || '');
    console.log(out);
    throw new Error('A section failed to render:\n' + out);
  }
  console.log(out);
  expect(out).toContain('all ');
  expect(out).not.toContain('FAIL');
});
