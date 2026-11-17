import { test, expect } from '@playwright/test';

const userA = {
  name: 'WebRTCHost E2E',
  email: `webrtchost${Date.now()}@example.com`,
  password: 'password123',
};

test.describe('WebRTC Video Calling', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/register');
    await page.fill('#name', userA.name);
    await page.fill('#email', userA.email);
    await page.fill('#password', userA.password);
    await page.fill('#confirmPassword', userA.password);
    await page.click('#register-submit');
    await expect(page).toHaveURL('/dashboard');

    await page.click('button:has-text("Create Room")');
    await page.fill('input[placeholder*="Room name"]', 'Call Room');
    await page.click('button:has-text("Create Room")');
    await expect(page.locator('.room-card')).toHaveCount(1);
    await page.click('button:has-text("Enter")');
  });

  test('User can start a call with fake media devices', async ({ page }) => {
    const loginRes = await page.request.post('http://localhost:5500/api/auth/login', {
      data: { email: userA.email, password: userA.password },
    });
    const authToken = (await loginRes.json()).token;

    const roomRes = await page.request.get('http://localhost:5500/api/rooms/my/rooms', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const rooms = await roomRes.json();
    const roomId = rooms.rooms[0].id;

    await page.goto(`/call/${roomId}`);

    await page.click('button:has-text("Start Call")');

    await expect(page.locator('.status-badge.status-active')).toBeVisible({ timeout: 10000 });

    await expect(page.locator('.local .participant-video')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.local-badge')).toHaveText('You');
  });

  test('Microphone mute/unmute works', async ({ page }) => {
    const loginRes = await page.request.post('http://localhost:5500/api/auth/login', {
      data: { email: userA.email, password: userA.password },
    });
    const authToken = (await loginRes.json()).token;

    const roomRes = await page.request.get('http://localhost:5500/api/rooms/my/rooms', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const rooms = await roomRes.json();
    const roomId = rooms.rooms[0].id;

    await page.goto(`/call/${roomId}`);
    await page.click('button:has-text("Start Call")');
    await expect(page.locator('.status-badge.status-active')).toBeVisible({ timeout: 10000 });

    await page.click('button[title="Mute microphone"]');
    await expect(page.locator('.mic-off')).toBeVisible();

    await page.click('button[title="Unmute microphone"]');
    await expect(page.locator('.mic-off')).toBeHidden();
  });

  test('Camera on/off works', async ({ page }) => {
    const loginRes = await page.request.post('http://localhost:5500/api/auth/login', {
      data: { email: userA.email, password: userA.password },
    });
    const authToken = (await loginRes.json()).token;

    const roomRes = await page.request.get('http://localhost:5500/api/rooms/my/rooms', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const rooms = await roomRes.json();
    const roomId = rooms.rooms[0].id;

    await page.goto(`/call/${roomId}`);
    await page.click('button:has-text("Start Call")');
    await expect(page.locator('.status-badge.status-active')).toBeVisible({ timeout: 10000 });

    await page.click('button[title="Turn off camera"]');
    await expect(page.locator('.camera-off')).toBeVisible();

    await page.click('button[title="Turn on camera"]');
    await expect(page.locator('.camera-off')).toBeHidden();
  });

  test('Screen sharing start and stop', async ({ page }) => {
    const loginRes = await page.request.post('http://localhost:5500/api/auth/login', {
      data: { email: userA.email, password: userA.password },
    });
    const authToken = (await loginRes.json()).token;

    const roomRes = await page.request.get('http://localhost:5500/api/rooms/my/rooms', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const rooms = await roomRes.json();
    const roomId = rooms.rooms[0].id;

    await page.goto(`/call/${roomId}`);
    await page.click('button:has-text("Start Call")');
    await expect(page.locator('.status-badge.status-active')).toBeVisible({ timeout: 10000 });

    await page.click('button[title="Share screen"]');
    await expect(page.locator('button[title="Stop screen sharing"]')).toBeVisible();

    await page.click('button[title="Stop screen sharing"]');
    await expect(page.locator('button[title="Share screen"]')).toBeVisible();
  });

  test('Call termination cleans up peer connections', async ({ page }) => {
    const loginRes = await page.request.post('http://localhost:5500/api/auth/login', {
      data: { email: userA.email, password: userA.password },
    });
    const authToken = (await loginRes.json()).token;

    const roomRes = await page.request.get('http://localhost:5500/api/rooms/my/rooms', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const rooms = await roomRes.json();
    const roomId = rooms.rooms[0].id;

    await page.goto(`/call/${roomId}`);
    await page.click('button:has-text("Start Call")');
    await expect(page.locator('.status-badge.status-active')).toBeVisible({ timeout: 10000 });

    await page.click('button[title="End call"]');
    await expect(page.locator('.status-badge.status-active')).toBeHidden();
  });
});
