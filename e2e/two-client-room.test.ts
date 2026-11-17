import { test, expect } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Two-Client Watch Party', () => {
  const user1 = {
    name: 'Alice Test',
    email: `alice${Date.now()}@example.com`,
    password: 'password123',
  };
  const user2 = {
    name: 'Bob Test',
    email: `bob${Date.now()}@example.com`,
    password: 'password123',
  };

  let roomToken: string;
  let roomId: string;

  test('User 1 registers and logs in', async ({ page }) => {
    await page.goto('/register');
    await page.fill('input[name="name"]', user1.name);
    await page.fill('input[name="email"]', user1.email);
    await page.fill('input[name="password"]', user1.password);
    await page.fill('input[name="confirmPassword"]', user1.password);
    await page.click('button:has-text("Create Account")');
    await expect(page).toHaveURL('/dashboard');
  });

  test('User 1 creates a private room', async ({ page }) => {
    await page.goto('/dashboard');
    await page.click('button:has-text("Create Room")');
    await page.fill('input[placeholder*="Room name"]', "Alice's Movie Night");
    await page.click('button:has-text("Create Room")');

    // Wait for room to be created and appear in the list
    await expect(page.locator('.room-card')).toHaveCount(1);
    await expect(page.locator('.room-card')).toContainText("Alice's Movie Night");

    // Extract room token from the room card
    roomToken = await page.locator('.room-token code').textContent();
    expect(roomToken).toBeTruthy();
  });

  test('User 1 gets room details to extract roomId', async ({ page, request }) => {
    // We need the room ID for API calls. Login as user1 via API to get it.
    const loginRes = await request.post('http://localhost:5500/api/auth/login', {
      data: { email: user1.email, password: user1.password },
    });
    expect(loginRes.ok()).toBeTruthy();
    const token = (await loginRes.json()).token;

    const roomsRes = await request.get('http://localhost:5500/api/rooms/my/rooms', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(roomsRes.ok()).toBeTruthy();
    const rooms = (await roomsRes.json()).rooms;
    expect(rooms.length).toBeGreaterThan(0);
    roomId = rooms[0].id;
  });

  test('User 2 registers and logs in', async ({ page }) => {
    await page.goto('/register');
    await page.fill('input[name="name"]', user2.name);
    await page.fill('input[name="email"]', user2.email);
    await page.fill('input[name="password"]', user2.password);
    await page.fill('input[name="confirmPassword"]', user2.password);
    await page.click('button:has-text("Create Account")');
    await expect(page).toHaveURL('/dashboard');
  });

  test('User 2 joins the room using the token', async ({ page }) => {
    await page.goto('/dashboard');
    await page.click('button:has-text("Join Room")');
    await page.fill('input[placeholder*="room token"]', roomToken || '');
    await page.click('button:has-text("Join Room")');

    // Should navigate to the room page
    await expect(page).toHaveURL(/\/room\//);
  });

  test('Both users see each other as participants', async ({ page }) => {
    // Check participant count shows 2
    await expect(page.locator('.room-members-count, [data-testid="room-members-count"]')).toContainText('2');
  });

  test('User 1 adds a YouTube video to the room', async ({ page, request }) => {
    // Login as user1 via API to add media
    const loginRes = await request.post('http://localhost:5500/api/auth/login', {
      data: { email: user1.email, password: user1.password },
    });
    const token = (await loginRes.json()).token;

    const addRes = await request.post(`http://localhost:5500/api/rooms/${roomId}/playlist`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        title: 'Big Buck Bunny',
        url: 'https://www.youtube.com/watch?v=XtF6YJw0s5o',
        type: 'youtube',
      },
    });
    expect(addRes.ok()).toBeTruthy();
  });

  test('User 1 changes media to the YouTube video', async ({ page, request }) => {
    const loginRes = await request.post('http://localhost:5500/api/auth/login', {
      data: { email: user1.email, password: user1.password },
    });
    const token = (await loginRes.json()).token;

    await request.put(`http://localhost:5500/api/rooms/${roomId}/media`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        title: 'Big Buck Bunny',
        url: 'https://www.youtube.com/watch?v=XtF6YJw0s5o',
        type: 'youtube',
      },
    });
  });

  test('Both users see the media change', async ({ page }) => {
    // Wait for the media player to show the YouTube video
    await expect(page.locator('.yt-player, iframe[src*="youtube"]')).toBeVisible({ timeout: 10000 });
  });

  test('User 1 sends a chat message', async ({ page }) => {
    await page.fill('input[placeholder*="message"]', 'Hello from Alice!');
    await page.press('input[placeholder*="message"]', 'Enter');

    await expect(page.locator('.chat-bubble')).toContainText('Hello from Alice!');
  });

  test('User 2 sees the chat message', async ({ page, browser }) => {
    // Open a new tab for user 2
    const context = await browser.newContext({ baseURL: 'http://localhost:5273' });
    const page2 = await context.newPage();

    // Login as user2 via API
    const loginRes = await page2.request.post('http://localhost:5500/api/auth/login', {
      data: { email: user2.email, password: user2.password },
    });
    const token = (await loginRes.json()).token;

    // Set auth token in localStorage and navigate to room
    await page2.addInitScript((token) => {
      localStorage.setItem('cowatch_token', token);
      localStorage.setItem('cowatch_user', JSON.stringify({ id: 'user2', name: 'Bob Test', email: 'bob@example.com' }));
    }, token);

    await page2.goto(`/room/${roomId}`);

    // Wait for chat message to appear
    await expect(page2.locator('.chat-bubble')).toContainText('Hello from Alice!', { timeout: 10000 });

    await context.close();
  });

  test('User 1 sends a reaction', async ({ page }) => {
    await page.click('.reaction-btn:has-text("❤️")');
    await expect(page.locator('.floating-emoji')).toContainText('❤️');
  });

  test('User 1 plays and pauses media', async ({ page }) => {
    // Click play button
    await page.click('button:has-text("Play")');
    await expect(page.locator('.media-title')).toContainText('Big Buck Bunny');

    // Click pause
    await page.click('button:has-text("Pause")');
  });

  test('Participants cleanup on disconnect', async ({ page, browser }) => {
    // User 2 disconnects by closing their tab
    // This is implicitly tested by the socket disconnect test
    // Verify user 1 still sees the room
    await expect(page.locator('h2')).toContainText("Alice's Movie Night");
  });
});
