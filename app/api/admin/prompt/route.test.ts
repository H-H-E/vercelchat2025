import { GET, POST } from './route';
import { auth } from '@/app/(auth)/auth';
import { getMasterPrompt, updateMasterPrompt } from '@/lib/db/queries';
import { NextResponse } from 'next/server';

jest.mock('@/app/(auth)/auth');
jest.mock('@/lib/db/queries');
jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body, init) => ({ body, init })),
  },
}));

const mockAuth = auth as jest.Mock;
const mockGetMasterPrompt = getMasterPrompt as jest.Mock;
const mockUpdateMasterPrompt = updateMasterPrompt as jest.Mock;
const mockNextResponseJson = NextResponse.json as jest.Mock;

describe('API Route: /api/admin/prompt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET', () => {
    it('should return master prompt for admin user', async () => {
      mockAuth.mockResolvedValue({ user: { type: 'admin' } });
      mockGetMasterPrompt.mockResolvedValue({ promptText: 'Admin prompt' });
      
      const response = await GET({} as Request);
      
      expect(mockAuth).toHaveBeenCalledTimes(1);
      expect(mockGetMasterPrompt).toHaveBeenCalledTimes(1);
      expect(mockNextResponseJson).toHaveBeenCalledWith({ promptText: 'Admin prompt' });
    });

    it('should return 403 for non-admin user', async () => {
      mockAuth.mockResolvedValue({ user: { type: 'user' } });
      
      await GET({} as Request);
      
      expect(mockAuth).toHaveBeenCalledTimes(1);
      expect(mockGetMasterPrompt).not.toHaveBeenCalled();
      expect(mockNextResponseJson).toHaveBeenCalledWith({ error: 'Forbidden' }, { status: 403 });
    });

    it('should return 403 if user is unauthenticated', async () => {
      mockAuth.mockResolvedValue(null);
      
      await GET({} as Request);
      
      expect(mockAuth).toHaveBeenCalledTimes(1);
      expect(mockGetMasterPrompt).not.toHaveBeenCalled();
      expect(mockNextResponseJson).toHaveBeenCalledWith({ error: 'Forbidden' }, { status: 403 });
    });

    it('should return 404 if master prompt not found', async () => {
      mockAuth.mockResolvedValue({ user: { type: 'admin' } });
      mockGetMasterPrompt.mockResolvedValue(null);
      
      await GET({} as Request);
      
      expect(mockGetMasterPrompt).toHaveBeenCalledTimes(1);
      expect(mockNextResponseJson).toHaveBeenCalledWith({ error: 'Master prompt not found' }, { status: 404 });
    });

    it('should return 500 if getMasterPrompt throws an error', async () => {
      mockAuth.mockResolvedValue({ user: { type: 'admin' } });
      mockGetMasterPrompt.mockRejectedValue(new Error('DB error'));
      
      await GET({} as Request);
      
      expect(mockGetMasterPrompt).toHaveBeenCalledTimes(1);
      expect(mockNextResponseJson).toHaveBeenCalledWith({ error: 'Internal Server Error' }, { status: 500 });
    });
  });

  describe('POST', () => {
    const mockRequest = (body: any) => ({
      json: async () => body,
    } as Request);

    it('should update master prompt for admin user', async () => {
      mockAuth.mockResolvedValue({ user: { type: 'admin' } });
      const newPrompt = { promptText: 'Updated prompt' };
      mockUpdateMasterPrompt.mockResolvedValue([newPrompt]);
      
      const request = mockRequest({ promptText: 'Updated prompt' });
      await POST(request);
      
      expect(mockAuth).toHaveBeenCalledTimes(1);
      expect(mockUpdateMasterPrompt).toHaveBeenCalledWith('Updated prompt');
      expect(mockNextResponseJson).toHaveBeenCalledWith(newPrompt);
    });

    it('should return 403 for non-admin user', async () => {
      mockAuth.mockResolvedValue({ user: { type: 'user' } });
      
      const request = mockRequest({ promptText: 'User trying to update' });
      await POST(request);
      
      expect(mockAuth).toHaveBeenCalledTimes(1);
      expect(mockUpdateMasterPrompt).not.toHaveBeenCalled();
      expect(mockNextResponseJson).toHaveBeenCalledWith({ error: 'Forbidden' }, { status: 403 });
    });

    it('should return 403 if user is unauthenticated', async () => {
      mockAuth.mockResolvedValue(null);
      
      const request = mockRequest({ promptText: 'Unauth trying to update' });
      await POST(request);
      
      expect(mockAuth).toHaveBeenCalledTimes(1);
      expect(mockUpdateMasterPrompt).not.toHaveBeenCalled();
      expect(mockNextResponseJson).toHaveBeenCalledWith({ error: 'Forbidden' }, { status: 403 });
    });

    it('should return 400 for empty prompt text', async () => {
      mockAuth.mockResolvedValue({ user: { type: 'admin' } });
      
      const request = mockRequest({ promptText: ' ' }); // Empty or whitespace
      await POST(request);
      
      expect(mockUpdateMasterPrompt).not.toHaveBeenCalled();
      expect(mockNextResponseJson).toHaveBeenCalledWith({ error: 'Prompt text is required' }, { status: 400 });
    });
    
    it('should return 400 for missing prompt text', async () => {
      mockAuth.mockResolvedValue({ user: { type: 'admin' } });
      
      const request = mockRequest({}); // Missing promptText
      await POST(request);
      
      expect(mockUpdateMasterPrompt).not.toHaveBeenCalled();
      expect(mockNextResponseJson).toHaveBeenCalledWith({ error: 'Prompt text is required' }, { status: 400 });
    });

    it('should return 500 if updateMasterPrompt fails', async () => {
      mockAuth.mockResolvedValue({ user: { type: 'admin' } });
      mockUpdateMasterPrompt.mockResolvedValue(null); // Or mockRejectedValue
      
      const request = mockRequest({ promptText: 'Valid prompt' });
      await POST(request);
      
      expect(mockUpdateMasterPrompt).toHaveBeenCalledWith('Valid prompt');
      expect(mockNextResponseJson).toHaveBeenCalledWith({ error: 'Failed to update master prompt' }, { status: 500 });
    });
    
    it('should return 500 if updateMasterPrompt throws an error', async () => {
        mockAuth.mockResolvedValue({ user: { type: 'admin' } });
        mockUpdateMasterPrompt.mockRejectedValue(new Error('DB Error'));
        
        const request = mockRequest({ promptText: 'Another valid prompt' });
        await POST(request);
        
        expect(mockUpdateMasterPrompt).toHaveBeenCalledWith('Another valid prompt');
        expect(mockNextResponseJson).toHaveBeenCalledWith({ error: 'Internal Server Error' }, { status: 500 });
    });

    it('should return 400 for invalid JSON in request body', async () => {
      mockAuth.mockResolvedValue({ user: { type: 'admin' } });
      const invalidRequest = {
        json: async () => { throw new SyntaxError('Invalid JSON'); },
      } as Request;
      
      await POST(invalidRequest);
      
      expect(mockUpdateMasterPrompt).not.toHaveBeenCalled();
      expect(mockNextResponseJson).toHaveBeenCalledWith({ error: 'Invalid JSON in request body' }, { status: 400 });
    });
  });
});
