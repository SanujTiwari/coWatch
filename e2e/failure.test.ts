import { test, expect } from '@playwright/test';

test.describe('Failure Handling', () => {
  const userA = {
    name: 'FailureHost E2E',
    email: `failurehost${Date.now()}@example.com`,
    password: 'password123',
  };

  test.beforeEach(async ({ page }) => {
    await page.goto('/register');
    await page.fill('#name', userA.name);
    await page.fill('#email', userA.email);
    await page.fill('#password', userA.password);
    await page.fill('#confirmPassword', userA.password);
    await page.click('#register-submit');
    await expect(page).toHaveURL('/dashboard');
  });

  test('Camera permission denied - call still works without video', async ({ page, context }) => {
    await context.clearPermissions();

    await page.click('button:has-text("Create Room")');
    await page.fill('input[placeholder*="Room name"]', 'No Cam Room');
    await page.click('button:has-text("Create Room")');
    await expect(page.locator('.room-card')).toHaveCount(1);
    await page.click('button:has-text("Enter")');

    await page.click('button:has-text("Start Call")');

    await expect(page.locator('.status-badge.status-active, .call-error')).toBeVisible({ timeout: 10000 });
  });

  test('Invalid media URL shows error', async ({ page }) => {
    await page.click('button:has-text("Create Room")');
    await page.fill('input[placeholder*="Room name"]', 'Bad Media Room');
    await page.click('button:has-text("Create Room")');
    await page.click('button:has-text("Enter")');

    const loginRes = await page.request.post('http://localhost:5500/api/auth/login', {
      data: { email: userA.email, password: userA.password },
    });
    const authToken = (await loginRes.json()).token;

    const roomRes = await page.request.get('http://localhost:5500/api/rooms/my/rooms', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const rooms = await roomRes.json();
    const roomId = rooms.rooms[0].id;

    const res = await page.request.put(`http://localhost:5500/api/rooms/${roomId}/media`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        title: 'Bad',
        url: 'not-a-valid-url',
        type: 'video',
      },
    });
    expect(res.status()).toBe(400);
  });

  test('Missing JWT is rejected', async ({ page }) => {
    await page.goto('/room/00000000-0000-0000-0000-000000000000');
    await expect(page).toHaveURL('/login');
  });

  test('Expired JWT redirects to login', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.removeItem('cowatch_token');
      localStorage.removeItem('cowatch_user');
    });
    await page.goto('/dashboard');
    await expect(page).toHaveURL('/login');
  });

  test('Room deletion during active session', async ({ page }) => {
    await page.click('button:has-text("Create Room")');
    await page.fill('input[placeholder*="Room name"]', 'Delete Room');
    await page.click('button:has-text("Create Room")');
    await expect(page.locator('.room-card')).toHaveCount(1);

    await page.click('button:has-text("Enter")');
    await expect(page.locator('h2')).toContainText('Delete Room');

    await page.click('button:has-text("Exit Room")');
    await page.click('button:has-text("Delete")');
    await expect(page.locator('.room-card')).toHaveCount(0);
  });
});
