import { test, expect } from '@playwright/test';

test.describe('Combined Experience - Watch While Calling', () => {
  const userA = {
    name: 'CombinedHost E2E',
    email: `combinedhost${Date.now()}@example.com`,
    password: 'password123',
  };
  const userB = {
    name: 'CombinedGuest E2E',
    email: `combinedguest${Date.now()}@example.com`,
    password: 'password123',
  };

  test('Two users watch together with video call', async ({ page, browser }) => {
    await page.goto('/register');
    await page.fill('#name', userA.name);
    await page.fill('#email', userA.email);
    await page.fill('#password', userA.password);
    await page.fill('#confirmPassword', userA.password);
    await page.click('#register-submit');
    await expect(page).toHaveURL('/dashboard');

    await page.click('button:has-text("Create Room")');
    await page.fill('input[placeholder*="Room name"]', 'Combined Test Room');
    await page.click('button:has-text("Create Room")');
    await expect(page.locator('.room-card')).toHaveCount(1);

    const loginRes = await page.request.post('http://localhost:5500/api/auth/login', {
      data: { email: userA.email, password: userA.password },
    });
    const authToken = (await loginRes.json()).token;

    const roomRes = await page.request.get('http://localhost:5500/api/rooms/my/rooms', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const rooms = await roomRes.json();
    const roomId = rooms.rooms[0].id;
    const roomToken = rooms.rooms[0].token;

    const contextB = await browser.newContext({
      baseURL: 'http://localhost:5273',
      permissions: ['camera', 'microphone'],
    });
    const pageB = await contextB.newPage();

    await pageB.goto('/register');
    await pageB.fill('#name', userB.name);
    await pageB.fill('#email', userB.email);
    await pageB.fill('#password', userB.password);
    await pageB.fill('#confirmPassword', userB.password);
    await pageB.click('#register-submit');
    await expect(pageB).toHaveURL('/dashboard');

    await pageB.click('button:has-text("Join Room")');
    await pageB.fill('input[placeholder*="room token"]', roomToken);
    await pageB.click('button:has-text("Join Room")');
    await expect(pageB).toHaveURL(/\/room\//);

    await page.click('button:has-text("Enter")');
    await expect(page.locator('h2')).toContainText('Combined Test Room');

    await expect(page.locator('.room-members-count, [data-testid="room-members-count"]')).toContainText('2');
    await expect(pageB.locator('.room-members-count, [data-testid="room-members-count"]')).toContainText('2');

    await page.click('button:has-text("Start Call")');
    await expect(page.locator('.status-badge.status-active')).toBeVisible({ timeout: 10000 });

    await pageB.click('button:has-text("Enter")');
    await pageB.click('button:has-text("Start Call")');
    await expect(pageB.locator('.status-badge.status-active')).toBeVisible({ timeout: 10000 });

    await page.request.put(`http://localhost:5500/api/rooms/${roomId}/media`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        title: 'Big Buck Bunny',
        url: 'https://www.youtube.com/watch?v=XtF6YJw0s5o',
        type: 'youtube',
      },
    });

    await page.reload();
    await pageB.reload();

    await expect(page.locator('.yt-player, iframe[src*="youtube"]')).toBeVisible({ timeout: 15000 });
    await expect(pageB.locator('.yt-player, iframe[src*="youtube"]')).toBeVisible({ timeout: 15000 });

    await page.fill('input[placeholder*="message"]', 'Great video!');
    await page.press('input[placeholder*="message"]', 'Enter');

    await expect(pageB.locator('.chat-bubble')).toContainText('Great video!', { timeout: 10000 });

    await page.click('.reaction-btn:has-text("❤️")');
    await expect(page.locator('.floating-emoji')).toContainText('❤️');

    await contextB.close();

    await expect(page.locator('.call-notification, .room-notification')).toContainText('left', { timeout: 10000 });

    const contextB2 = await browser.newContext({
      baseURL: 'http://localhost:5273',
      permissions: ['camera', 'microphone'],
    });
    const pageB2 = await contextB2.newPage();

    await pageB2.goto('/login');
    await pageB2.fill('#email', userB.email);
    await pageB2.fill('#password', userB.password);
    await pageB2.click('#login-submit');
    await expect(pageB2).toHaveURL('/dashboard');

    await pageB2.click('button:has-text("Join Room")');
    await pageB2.fill('input[placeholder*="room token"]', roomToken);
    await pageB2.click('button:has-text("Join Room")');
    await expect(pageB2).toHaveURL(/\/room\//);
    await pageB2.click('button:has-text("Enter")');

    await expect(page.locator('.call-notification, .room-notification')).toContainText('joined', { timeout: 10000 });

    await expect(page.locator('.room-members-count, [data-testid="room-members-count"]')).toContainText('2');

    await contextB2.close();
  });
});
