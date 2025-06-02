import { ChatPage } from '../pages/chat';
import { test, expect } from '../fixtures';

test.describe('Chat activity', () => {
  let chatPage: ChatPage;

  test.beforeEach(async ({ page }) => {
    chatPage = new ChatPage(page);
    await chatPage.createNewChat();
  });

  test('Send a user message and receive response', async () => {
    await chatPage.sendUserMessage('Why is grass green?');
    await chatPage.isGenerationComplete();

    const assistantMessage = await chatPage.getRecentAssistantMessage();
    expect(assistantMessage.content).toContain("It's just green duh!");
  });

  test('Redirect to /chat/:id after submitting message', async () => {
    await chatPage.sendUserMessage('Why is grass green?');
    await chatPage.isGenerationComplete();

    const assistantMessage = await chatPage.getRecentAssistantMessage();
    expect(assistantMessage.content).toContain("It's just green duh!");
    await chatPage.hasChatIdInUrl();
  });

  test('Send a user message from suggestion', async () => {
    await chatPage.sendUserMessageFromSuggestion();
    await chatPage.isGenerationComplete();

    const assistantMessage = await chatPage.getRecentAssistantMessage();
    expect(assistantMessage.content).toContain(
      'With Next.js, you can ship fast!',
    );
  });

  test('Toggle between send/stop button based on activity', async () => {
    await expect(chatPage.sendButton).toBeVisible();
    await expect(chatPage.sendButton).toBeDisabled();

    await chatPage.sendUserMessage('Why is grass green?');

    await expect(chatPage.sendButton).not.toBeVisible();
    await expect(chatPage.stopButton).toBeVisible();

    await chatPage.isGenerationComplete();

    await expect(chatPage.stopButton).not.toBeVisible();
    await expect(chatPage.sendButton).toBeVisible();
  });

  test('Stop generation during submission', async () => {
    await chatPage.sendUserMessage('Why is grass green?');
    await expect(chatPage.stopButton).toBeVisible();
    await chatPage.stopButton.click();
    await expect(chatPage.sendButton).toBeVisible();
  });

  test('Edit user message and resubmit', async () => {
    await chatPage.sendUserMessage('Why is grass green?');
    await chatPage.isGenerationComplete();

    const assistantMessage = await chatPage.getRecentAssistantMessage();
    expect(assistantMessage.content).toContain("It's just green duh!");

    const userMessage = await chatPage.getRecentUserMessage();
    await userMessage.edit('Why is the sky blue?');

    await chatPage.isGenerationComplete();

    const updatedAssistantMessage = await chatPage.getRecentAssistantMessage();
    expect(updatedAssistantMessage.content).toContain("It's just blue duh!");
  });

  test('Hide suggested actions after sending message', async () => {
    await chatPage.isElementVisible('suggested-actions');
    await chatPage.sendUserMessageFromSuggestion();
    await chatPage.isElementNotVisible('suggested-actions');
  });

  test('Upload file and send image attachment with message', async () => {
    await chatPage.addImageAttachment();

    await chatPage.isElementVisible('attachments-preview');
    await chatPage.isElementVisible('input-attachment-loader');
    await chatPage.isElementNotVisible('input-attachment-loader');

    await chatPage.sendUserMessage('Who painted this?');

    const userMessage = await chatPage.getRecentUserMessage();
    expect(userMessage.attachments).toHaveLength(1);

    await chatPage.isGenerationComplete();

    const assistantMessage = await chatPage.getRecentAssistantMessage();
    expect(assistantMessage.content).toBe('This painting is by Monet!');
  });

  test('Call weather tool', async () => {
    await chatPage.sendUserMessage("What's the weather in sf?");
    await chatPage.isGenerationComplete();

    const assistantMessage = await chatPage.getRecentAssistantMessage();

    expect(assistantMessage.content).toBe(
      'The current temperature in San Francisco is 17°C.',
    );
  });

  test('Upvote message', async () => {
    await chatPage.sendUserMessage('Why is the sky blue?');
    await chatPage.isGenerationComplete();

    const assistantMessage = await chatPage.getRecentAssistantMessage();
    await assistantMessage.upvote();
    await chatPage.isVoteComplete();
  });

  test('Downvote message', async () => {
    await chatPage.sendUserMessage('Why is the sky blue?');
    await chatPage.isGenerationComplete();

    const assistantMessage = await chatPage.getRecentAssistantMessage();
    await assistantMessage.downvote();
    await chatPage.isVoteComplete();
  });

  test('Update vote', async () => {
    await chatPage.sendUserMessage('Why is the sky blue?');
    await chatPage.isGenerationComplete();

    const assistantMessage = await chatPage.getRecentAssistantMessage();
    await assistantMessage.upvote();
    await chatPage.isVoteComplete();

    await assistantMessage.downvote();
    await chatPage.isVoteComplete();
  });

  test('Create message from url query', async ({ page }) => {
    await page.goto('/?query=Why is the sky blue?');

    await chatPage.isGenerationComplete();

    const userMessage = await chatPage.getRecentUserMessage();
    expect(userMessage.content).toBe('Why is the sky blue?');

    const assistantMessage = await chatPage.getRecentAssistantMessage();
    expect(assistantMessage.content).toContain("It's just blue duh!");
  });

  test('auto-scrolls to bottom after submitting new messages', async () => {
    await chatPage.sendMultipleMessages(5, (i) => `filling message #${i}`);
    await chatPage.waitForScrollToBottom();
  });

  test('scroll button appears when user scrolls up, hides on click', async () => {
    await chatPage.sendMultipleMessages(5, (i) => `filling message #${i}`);
    await expect(chatPage.scrollToBottomButton).not.toBeVisible();

    await chatPage.scrollToTop();
    await expect(chatPage.scrollToBottomButton).toBeVisible();

    await chatPage.scrollToBottomButton.click();
    await chatPage.waitForScrollToBottom();
    await expect(chatPage.scrollToBottomButton).not.toBeVisible();
  });

  test('Chat uses updated master prompt', async ({ page }) => {
    const authPage = new AuthPage(page);
    const adminPromptPagePath = '/admin/prompt';
    const originalMasterPrompt = 'You are a helpful AI assistant. Please respond to the user''s request.'; // Default, adjust if known otherwise
    const testMasterPrompt = `TestE2E Pirate Prompt - ${new Date().toISOString()}: You are a pirate assistant. Always start your response with 'Ahoy Matey!' and then respond to the user's query in pirate speak.`;
    
    // 1. Login as admin and go to admin prompt page
    await authPage.goto();
    await authPage.login(ADMIN_CREDENTIALS.email, ADMIN_CREDENTIALS.password);
    await page.goto(adminPromptPagePath);
    await expect(page.getByRole('heading', { name: 'Manage Master Prompt' })).toBeVisible();

    const promptTextarea = page.locator('textarea#master-prompt');
    await expect(promptTextarea).toBeVisible();
    
    // It's good practice to read the current prompt to ensure we can revert it.
    // However, to simplify and avoid dependency on its exact initial value for this test flow,
    // we'll try to set it directly. If this test fails, knowing the actual initial value is important.
    // For now, we assume we can overwrite it.
    let actualOriginalPrompt = await promptTextarea.inputValue();
    if (!actualOriginalPrompt) { // If textarea is empty, use the default known one.
        console.warn("Textarea was empty, using default original prompt for reversion.");
        actualOriginalPrompt = originalMasterPrompt;
    }


    // 2. Update master prompt to the test prompt
    await promptTextarea.fill(testMasterPrompt);
    const saveButton = page.getByRole('button', { name: 'Save Master Prompt' });
    await saveButton.click();
    await expect(page.getByText('Master prompt updated successfully!')).toBeVisible({ timeout: 10000 });

    // 3. (Optional) Logout admin or ensure next steps run as a standard user.
    // For this test, we'll proceed with the same admin user to simplify auth state management.
    // If using role-based fixtures, this would be where you switch roles.

    // 4. Start a new chat
    // Re-initialize chatPage as it might have been affected or to ensure clean state
    chatPage = new ChatPage(page); 
    await chatPage.createNewChat(); // This will navigate to a new chat page

    // 5. Send a simple message
    await chatPage.sendUserMessage('Hello there, landlubber!');
    await chatPage.isGenerationComplete({ timeout: 20000 }); // Allow more time for generation

    // 6. Verify AI's response incorporates the master prompt
    const assistantMessage = await chatPage.getRecentAssistantMessage();
    expect(assistantMessage.content).toContain('Ahoy Matey!');
    // Add more pirate-speak assertions if desired, e.g. expect(assistantMessage.content).toMatch(/scurvy dog|pieces o' eight/i);

    // 7. Cleanup: Revert master prompt
    await page.goto(adminPromptPagePath); // Admin is still logged in
    await expect(promptTextarea).toBeVisible();
    await promptTextarea.fill(actualOriginalPrompt); // Revert to the actual original prompt
    await saveButton.click();
    await expect(page.getByText('Master prompt updated successfully!')).toBeVisible({ timeout: 10000 });
    
    // Verify it's reverted by reloading (optional, but good for confidence)
    await page.reload();
    await expect(promptTextarea).toHaveValue(actualOriginalPrompt, { timeout: 10000 });
  });
});
