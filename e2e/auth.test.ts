import { test, expect } from '@playwright/test';

const userA = {
  name: 'Alice E2E',
  email: `alice${Date.now()}@example.com`,
  password: 'password123',
};

test.describe('Authentication', () => {
  test('User A can register', async ({ page }) => {
    await page.goto('/register');
    await page.fill('#name', userA.name);
    await page.fill('#email', userA.email);
    await page.fill('#password', userA.password);
    await page.fill('#confirmPassword', userA.password);
    await page.click('#register-submit');

    // Wait for either navigation or error message
    await page.waitForTimeout(2000);
    
    const url = page.url();
    console.log('Current URL after register:', url);
    
    const errorMsg = page.locator('.auth-error');
    if (await errorMsg.isVisible()) {
      console.log('Error message:', await errorMsg.textContent());
    }
    
    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('h1')).toContainText(userA.name.split(' ')[0]);
  });

  test('User B can register', async ({ page }) => {
    await page.goto('/register');
    await page.fill('#name', 'Bob E2E');
    await page.fill('#email', `bob${Date.now()}@example.com`);
    await page.fill('#password', 'password123');
    await page.fill('#confirmPassword', 'password123');
    await page.click('#register-submit');
    await expect(page).toHaveURL('/dashboard');
  });

  test('Login works', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', userA.email);
    await page.fill('#password', userA.password);
    await page.click('#login-submit');
    await expect(page).toHaveURL('/dashboard');
  });
});
