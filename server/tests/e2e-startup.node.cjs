const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const serverDir = path.resolve(__dirname, '..');
const appUrl = 'postgresql://test:test@localhost:5432/cowatch_app';

function run(args, env) {
  return spawnSync(process.execPath, args, {
    cwd: serverDir,
    env: { ...process.env, DATABASE_URL: appUrl, ...env },
    encoding: 'utf8',
    timeout: 10000,
  });
}

test('E2E startup requires an explicit database', () => {
  const result = run(['e2e-start.cjs'], { E2E_DATABASE_URL: '' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /E2E_DATABASE_URL must point to a dedicated test database/);
});

test('E2E startup refuses the application database without printing its URL', () => {
  const result = run(['e2e-start.cjs'], { E2E_DATABASE_URL: appUrl });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must not point to the configured application database/);
  assert.ok(!result.stderr.includes(appUrl));
});

for (const mode of ['require', 'no-verify', 'disable']) {
  test(`PostgreSQL certificate and hostname verification remain enabled with sslmode=${mode}`, () => {
    const result = run(['-e', `
      const { sequelize } = require('./config/db');
      const ssl = sequelize.options.dialectOptions.ssl;
      if (!ssl || ssl.rejectUnauthorized !== true || ssl.checkServerIdentity) process.exit(1);
    `], { DATABASE_URL: `${appUrl}?sslmode=${mode}` });
    assert.equal(result.status, 0, result.stderr);
  });
}
