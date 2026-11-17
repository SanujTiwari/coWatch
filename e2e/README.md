# Running E2E tests

Use an empty, dedicated PostgreSQL database or Neon branch, not the application
database. Put `E2E_DATABASE_URL` in the ignored `.env.e2e.local` file at the
repository root, or set it in the environment that runs Playwright. Never
commit the URL. The startup check rejects the configured application database,
but cannot detect every possible alias for the same database.

PostgreSQL certificate and hostname verification are required. If a trusted
private CA is needed, configure `NODE_EXTRA_CA_CERTS` before starting Node.
Do not disable TLS verification.

From the repository root in PowerShell:

```powershell
npx playwright test --list
npx playwright test e2e\auth.test.ts --grep "User A can register" --workers=1
```

Playwright starts and stops its own backend on port 5500 and frontend on port
5273. Both ports must be free. The backend waits for a successful database
connection and model synchronization before listening. The normal application
rate limits remain enabled, so a large run can encounter those limits.

The database is not automatically cleaned up. Use only a disposable database
and remove test data through its provider when it is no longer needed.
