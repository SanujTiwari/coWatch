import { test, expect } from '@playwright/test';

const userA = {
  name: 'WatchHost E2E',
  email: `watchhost${Date.now()}@example.com`,
  password: 'password123',
};

test.describe('Watch Together', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/register');
    await page.fill('#name', userA.name);
    await page.fill('#email', userA.email);
    await page.fill('#password', userA.password);
    await page.fill('#confirmPassword', userA.password);
    await page.click('#register-submit');
    await expect(page).toHaveURL('/dashboard');

    await page.click('button:has-text("Create Room")');
    await page.fill('input[placeholder*="Room name"]', 'Watch Room');
    await page.click('button:has-text("Create Room")');
    await expect(page.locator('.room-card')).toHaveCount(1);
    await page.click('button:has-text("Enter")');
  });

  test('User adds YouTube video and it loads', async ({ page }) => {
    const loginRes = await page.request.post('http://localhost:5500/api/auth/login', {
      data: { email: userA.email, password: userA.password },
    });
    const authToken = (await loginRes.json()).token;

    const roomRes = await page.request.get('http://localhost:5500/api/rooms/my/rooms', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const rooms = await roomRes.json();
    const roomId = rooms.rooms[0].id;

    await page.request.post(`http://localhost:5500/api/rooms/${roomId}/playlist`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        title: 'Big Buck Bunny',
        url: 'https://www.youtube.com/watch?v=XtF6YJw0s5o',
        type: 'youtube',
      },
    });

    await page.request.put(`http://localhost:5500/api/rooms/${roomId}/media`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        title: 'Big Buck Bunny',
        url: 'https://www.youtube.com/watch?v=XtF6YJw0s5o',
        type: 'youtube',
      },
    });

    await page.reload();

    await expect(page.locator('.yt-player, iframe[src*="youtube"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.media-title')).toContainText('Big Buck Bunny');
  });

  test('Direct video URL playback', async ({ page }) => {
    const loginRes = await page.request.post('http://localhost:5500/api/auth/login', {
      data: { email: userA.email, password: userA.password },
    });
    const authToken = (await loginRes.json()).token;

    const roomRes = await page.request.get('http://localhost:5500/api/rooms/my/rooms', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const rooms = await roomRes.json();
    const roomId = rooms.rooms[0].id;

    await page.request.put(`http://localhost:5500/api/rooms/${roomId}/media`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        title: 'Test Video',
        url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
        type: 'video',
      },
    });

    await page.reload();

    await expect(page.locator('video')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.media-title')).toContainText('Test Video');
  });

  test('Invalid media URL shows error', async ({ page }) => {
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
        title: 'Invalid',
        url: 'not-a-valid-url',
        type: 'video',
      },
    });
    expect(res.status()).toBe(400);
  });
});
