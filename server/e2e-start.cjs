const fs = require('fs');
const path = require('path');
const { randomBytes } = require('crypto');
const dotenv = require('dotenv');

const e2eEnvPath = path.join(__dirname, '..', '.env.e2e.local');
const e2eEnv = fs.existsSync(e2eEnvPath) ? dotenv.parse(fs.readFileSync(e2eEnvPath)) : {};
const testUrl = process.env.E2E_DATABASE_URL === undefined
  ? e2eEnv.E2E_DATABASE_URL
  : process.env.E2E_DATABASE_URL;
if (!testUrl) {
  throw new Error('E2E_DATABASE_URL must point to a dedicated test database.');
}

function databaseIdentity(connectionString) {
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error('Invalid PostgreSQL connection URL.');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
      !url.hostname || !url.pathname.slice(1) ||
      ['host', 'hostaddr', 'dbname', 'service'].some((key) => url.searchParams.has(key))) {
    throw new Error('The database URL must contain an explicit PostgreSQL host and database name.');
  }
  return `${url.hostname.toLowerCase().replace('-pooler.', '.')}:${url.port || '5432'}/${decodeURIComponent(url.pathname.slice(1))}`;
}

const identity = databaseIdentity(testUrl);
const envPath = path.join(__dirname, '..', '.env');
const fileEnv = fs.existsSync(envPath) ? dotenv.parse(fs.readFileSync(envPath)) : {};
for (const configuredUrl of [process.env.DATABASE_URL, fileEnv.DATABASE_URL]) {
  if (configuredUrl && databaseIdentity(configuredUrl) === identity) {
    throw new Error('E2E_DATABASE_URL must not point to the configured application database.');
  }
}

process.env.DATABASE_URL = testUrl;
process.env.PORT = '5500';
process.env.CLIENT_URL = 'http://localhost:5273';
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = randomBytes(32).toString('hex');
process.env.E2E_TEST_MODE = '1';

const { startServer } = require('./server');
startServer().catch((error) => {
  console.error('E2E backend startup failed:', error);
  process.exitCode = 1;
});
