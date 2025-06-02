import { systemPrompt, regularPrompt, artifactsPrompt, getRequestPromptFromHints, type RequestHints } from './prompts';
import { getMasterPrompt } from '@/lib/db/queries';

jest.mock('@/lib/db/queries');

const mockGetMasterPrompt = getMasterPrompt as jest.Mock;

describe('systemPrompt', () => {
  const mockRequestHints: RequestHints = {
    latitude: '34.0522',
    longitude: '-118.2437',
    city: 'Los Angeles',
    country: 'USA',
  };
  const requestPromptPart = getRequestPromptFromHints(mockRequestHints);

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock console.warn and console.error to suppress output during tests
    jest.spyOn(console, 'warn').mockImplementation(jest.fn());
    jest.spyOn(console, 'error').mockImplementation(jest.fn());
  });

  afterEach(() => {
    // Restore console mocks
    (console.warn as jest.Mock).mockRestore();
    (console.error as jest.Mock).mockRestore();
  });

  it('should use fetched master prompt when available for non-reasoning model', async () => {
    const fetchedPromptText = 'This is a fetched master prompt.';
    mockGetMasterPrompt.mockResolvedValue({ promptText: fetchedPromptText });

    const result = await systemPrompt({
      selectedChatModel: 'chat-model', // Not 'chat-model-reasoning'
      requestHints: mockRequestHints,
    });

    expect(mockGetMasterPrompt).toHaveBeenCalledTimes(1);
    expect(result).toBe(`${fetchedPromptText}\n\n${requestPromptPart}\n\n${artifactsPrompt}`);
  });
  
  it('should use fetched master prompt when available for reasoning model', async () => {
    const fetchedPromptText = 'This is a fetched master prompt for reasoning.';
    mockGetMasterPrompt.mockResolvedValue({ promptText: fetchedPromptText });

    const result = await systemPrompt({
      selectedChatModel: 'chat-model-reasoning',
      requestHints: mockRequestHints,
    });

    expect(mockGetMasterPrompt).toHaveBeenCalledTimes(1);
    expect(result).toBe(`${fetchedPromptText}\n\n${requestPromptPart}`);
  });

  it('should use fallback regularPrompt if getMasterPrompt returns null', async () => {
    mockGetMasterPrompt.mockResolvedValue(null);

    const result = await systemPrompt({
      selectedChatModel: 'chat-model',
      requestHints: mockRequestHints,
    });

    expect(mockGetMasterPrompt).toHaveBeenCalledTimes(1);
    expect(result).toBe(`${regularPrompt}\n\n${requestPromptPart}\n\n${artifactsPrompt}`);
    expect(console.warn).toHaveBeenCalledWith('Master prompt not found in DB, using fallback.');
  });
  
  it('should use fallback regularPrompt if getMasterPrompt returns object without promptText', async () => {
    mockGetMasterPrompt.mockResolvedValue({ someOtherField: 'value' }); // No promptText

    const result = await systemPrompt({
      selectedChatModel: 'chat-model',
      requestHints: mockRequestHints,
    });
    
    expect(mockGetMasterPrompt).toHaveBeenCalledTimes(1);
    expect(result).toBe(`${regularPrompt}\n\n${requestPromptPart}\n\n${artifactsPrompt}`);
    expect(console.warn).toHaveBeenCalledWith('Master prompt not found in DB, using fallback.');
  });


  it('should use fallback regularPrompt if getMasterPrompt throws an error', async () => {
    const dbError = new Error('Database connection failed');
    mockGetMasterPrompt.mockRejectedValue(dbError);

    const result = await systemPrompt({
      selectedChatModel: 'chat-model',
      requestHints: mockRequestHints,
    });

    expect(mockGetMasterPrompt).toHaveBeenCalledTimes(1);
    expect(result).toBe(`${regularPrompt}\n\n${requestPromptPart}\n\n${artifactsPrompt}`);
    expect(console.error).toHaveBeenCalledWith('Failed to fetch master prompt, using fallback:', dbError);
  });

  it('should include artifactsPrompt for non-reasoning models', async () => {
    mockGetMasterPrompt.mockResolvedValue({ promptText: 'Test Prompt' });
    
    const result = await systemPrompt({
      selectedChatModel: 'some-other-model', // Any model not 'chat-model-reasoning'
      requestHints: mockRequestHints,
    });
    
    expect(result).toContain(artifactsPrompt);
  });

  it('should NOT include artifactsPrompt for reasoning models', async () => {
    mockGetMasterPrompt.mockResolvedValue({ promptText: 'Test Prompt for Reasoning' });
    
    const result = await systemPrompt({
      selectedChatModel: 'chat-model-reasoning',
      requestHints: mockRequestHints,
    });
    
    expect(result).not.toContain(artifactsPrompt);
    expect(result).toBe(`Test Prompt for Reasoning\n\n${requestPromptPart}`);
  });
});
