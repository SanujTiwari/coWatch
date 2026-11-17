import { test, expect } from '@playwright/test';

const userA = {
  name: 'RoomHost E2E',
  email: `host${Date.now()}@example.com`,
  password: 'password123',
};

async function registerUser(page, name = userA.name, email = userA.email, password = userA.password) {
  await page.goto('/register');
  await page.waitForLoadState('networkidle');
  await page.fill('#name', name);
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.fill('#confirmPassword', password);
  await page.click('#register-submit');
  
  // Check for error messages
  const errorMsg = page.locator('.auth-error');
  if (await errorMsg.isVisible({ timeout: 1000 })) {
    console.log('REGISTRATION ERROR:', await errorMsg.textContent());
  }
  
  await page.waitForTimeout(3000);
}

test.describe('Room Management', () => {
  test.beforeEach(async ({ page }) => {
    await registerUser(page, userA.name, userA.email, userA.password);
    await expect(page).toHaveURL('/dashboard');
  });

  test('User A creates a private room', async ({ page }) => {
    await page.click('button:has-text("Create Room")');
    await page.fill('input[placeholder*="Room name"]', "Alice's Private Room");
    await page.click('button:has-text("Create Room")');

    await expect(page.locator('.room-card')).toHaveCount(1);
    await expect(page.locator('.room-card')).toContainText("Alice's Private Room");
  });

  test('User B joins using room token', async ({ page, browser }) => {
    const loginRes = await page.request.post('http://localhost:5500/api/auth/login', {
      data: { email: userA.email, password: userA.password },
    });
    const tokenData = await loginRes.json();
    const authToken = tokenData.token;

    const roomRes = await page.request.post('http://localhost:5500/api/rooms/create', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: { name: 'Joinable Room' },
    });
    const roomData = await roomRes.json();
    const roomToken = roomData.room.token;

    const contextB = await browser.newContext({
      baseURL: 'http://localhost:5273',
      permissions: ['camera', 'microphone'],
    });
    const pageB = await contextB.newPage();

    await registerUser(pageB, 'RoomGuest E2E', `guest${Date.now()}@example.com`, 'password123');
    await expect(pageB).toHaveURL('/dashboard');

    await pageB.click('button:has-text("Join Room")');
    await pageB.fill('input[placeholder*="room token"]', roomToken);
    await pageB.click('button:has-text("Join Room")');

    await expect(pageB).toHaveURL(/\/room\//);

    await contextB.close();
  });

  test('Unauthorized users cannot access the room', async ({ page, browser }) => {
    const loginRes = await page.request.post('http://localhost:5500/api/auth/login', {
      data: { email: userA.email, password: userA.password },
    });
    const authToken = (await loginRes.json()).token;

    const roomRes = await page.request.post('http://localhost:5500/api/rooms/create', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: { name: 'Secure Room' },
    });
    const roomData = await roomRes.json();
    const roomId = roomData.room.id;

    const contextC = await browser.newContext({ baseURL: 'http://localhost:5273' });
    const pageC = await contextC.newPage();
    await pageC.goto(`/room/${roomId}`);
    await expect(pageC).toHaveURL('/login');

    await contextC.close();
  });

  test('Leaving and rejoining works', async ({ page }) => {
    const loginRes = await page.request.post('http://localhost:5500/api/auth/login', {
      data: { email: userA.email, password: userA.password },
    });
    const authToken = (await loginRes.json()).token;

    const roomRes = await page.request.post('http://localhost:5500/api/rooms/create', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: { name: 'Rejoin Room' },
    });
    const roomData = await roomRes.json();
    const roomId = roomData.room.id;

    await page.goto(`/room/${roomId}`);
    await expect(page.locator('h2')).toContainText('Rejoin Room');

    await page.click('button:has-text("Exit Room")');
    await expect(page).toHaveURL('/dashboard');

    await page.goto(`/room/${roomId}`);
    await expect(page.locator('h2')).toContainText('Rejoin Room');
  });
});
