import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: 'line',
  outputDir: './e2e-results',
  use: {
    baseURL: 'http://localhost:5273',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    viewport: { width: 1280, height: 720 },
    // Grant camera and microphone permissions by default
    permissions: ['camera', 'microphone'],
    // Launch with fake media devices for WebRTC testing
    launchOptions: {
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
      ],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'node server/e2e-start.cjs',
      url: 'http://localhost:5500/api/health',
      timeout: 60000,
      reuseExistingServer: false,
    },
    {
      command: 'npm --prefix client run dev -- --host localhost --port 5273 --strictPort',
      url: 'http://localhost:5273',
      timeout: 60000,
      reuseExistingServer: false,
      env: { VITE_API_ORIGIN: 'http://localhost:5500' },
    },
  ],
});
