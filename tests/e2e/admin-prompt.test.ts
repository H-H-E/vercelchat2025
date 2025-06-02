import { test, expect } from '../fixtures'; // Using existing fixtures
import { AuthPage } from '../pages/auth'; // Assuming AuthPage helper exists
import { ADMIN_CREDENTIALS, USER_CREDENTIALS } from '../helpers'; // Assuming credentials helper

test.describe('Admin Master Prompt Management', () => {
  const adminPromptPagePath = '/admin/prompt';

  test('Admin can login, view, and verify the prompt page', async ({ page }) => {
    const authPage = new AuthPage(page);
    await authPage.goto();
    await authPage.login(ADMIN_CREDENTIALS.email, ADMIN_CREDENTIALS.password);
    
    await page.goto(adminPromptPagePath);
    await expect(page).toHaveURL(adminPromptPagePath);
    
    await expect(page.getByRole('heading', { name: 'Manage Master Prompt' })).toBeVisible();
    const promptTextarea = page.locator('textarea#master-prompt');
    await expect(promptTextarea).toBeVisible();
    
    // Check if the textarea contains some default/initial prompt text.
    // This assumes the prompt is not empty initially.
    // Since we don't know the exact initial prompt, we check if it's not empty after a small delay for loading.
    await page.waitForTimeout(1000); // Wait for potential async loading of prompt
    const initialPromptValue = await promptTextarea.inputValue();
    expect(initialPromptValue.length).toBeGreaterThan(0); 
  });

  test('Admin can update the master prompt', async ({ page }) => {
    const authPage = new AuthPage(page);
    await authPage.goto();
    await authPage.login(ADMIN_CREDENTIALS.email, ADMIN_CREDENTIALS.password);
    
    await page.goto(adminPromptPagePath);
    await expect(page.getByRole('heading', { name: 'Manage Master Prompt' })).toBeVisible();

    const promptTextarea = page.locator('textarea#master-prompt');
    await expect(promptTextarea).toBeVisible();
    
    const originalPrompt = await promptTextarea.inputValue();
    const newPromptText = `Test E2E Master Prompt - ${new Date().toISOString()}`;
    
    await promptTextarea.fill(newPromptText);
    await expect(promptTextarea).toHaveValue(newPromptText);
    
    const saveButton = page.getByRole('button', { name: 'Save Master Prompt' });
    await saveButton.click();
    
    await expect(page.getByText('Master prompt updated successfully!')).toBeVisible({ timeout: 10000 }); // Increased timeout for API call

    // Reload the page and verify the updated prompt is displayed
    await page.reload();
    await expect(promptTextarea).toBeVisible();
    await expect(promptTextarea).toHaveValue(newPromptText, { timeout: 10000 }); // Wait for potential async loading

    // Optional: Revert to original prompt to leave system in a clean state
    // This might be better handled in a global setup/teardown if prompts are critical
    // For now, we'll revert it here.
    if (originalPrompt && originalPrompt !== newPromptText) {
        await promptTextarea.fill(originalPrompt);
        await saveButton.click();
        await expect(page.getByText('Master prompt updated successfully!')).toBeVisible({ timeout: 10000 });
    }
  });

  test('Non-admin user access to admin prompt page is denied', async ({ page }) => {
    const authPage = new AuthPage(page);
    await authPage.goto();
    await authPage.login(USER_CREDENTIALS.email, USER_CREDENTIALS.password); // Regular user
    
    await page.goto(adminPromptPagePath);
    
    // Check for "Access Denied" message. The exact text/selector might vary.
    // Or check that we are redirected or the main content of the admin page is not visible.
    const accessDeniedMessage = page.getByText(/Access Denied/i);
    await expect(accessDeniedMessage).toBeVisible({ timeout: 5000 });
    
    // Ensure the main page content is not there
    await expect(page.getByRole('heading', { name: 'Manage Master Prompt' })).not.toBeVisible();
    await expect(page.locator('textarea#master-prompt')).not.toBeVisible();
  });
});
