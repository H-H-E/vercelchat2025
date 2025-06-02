import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AdminPromptPage from './page'; // Adjust path as necessary
import { useSession } from 'next-auth/react';

// Mock next-auth/react
jest.mock('next-auth/react');
const mockUseSession = useSession as jest.Mock;

// Mock global fetch
global.fetch = jest.fn();
const mockFetch = global.fetch as jest.Mock;

describe('AdminPromptPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default session mock
    mockUseSession.mockReturnValue({ data: null, status: 'loading' });
  });

  test('renders loading session state initially', () => {
    render(<AdminPromptPage />);
    expect(screen.getByText('Loading session...')).toBeInTheDocument();
  });

  test('renders access denied if session is unauthenticated', () => {
    mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
    render(<AdminPromptPage />);
    expect(screen.getByText(/Access Denied/i)).toBeInTheDocument();
  });

  test('renders access denied if session user is not admin', () => {
    mockUseSession.mockReturnValue({
      data: { user: { type: 'user' } },
      status: 'authenticated',
    });
    render(<AdminPromptPage />);
    expect(screen.getByText(/Access Denied/i)).toBeInTheDocument();
  });

  describe('when user is admin', () => {
    beforeEach(() => {
      mockUseSession.mockReturnValue({
        data: { user: { type: 'admin' } },
        status: 'authenticated',
      });
    });

    test('fetches and displays the master prompt', async () => {
      const initialPrompt = 'Initial master prompt from API';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ promptText: initialPrompt }),
      });
      render(<AdminPromptPage />);

      expect(screen.getByText('Manage Master Prompt')).toBeInTheDocument();
      // Initially, textarea might be disabled or empty before fetch completes
      // Wait for the prompt to be displayed
      expect(await screen.findByDisplayValue(initialPrompt)).toBeInTheDocument();
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith('/api/admin/prompt');
    });

    test('displays an error message if fetching the prompt fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Server Error' }),
      });
      render(<AdminPromptPage />);

      expect(await screen.findByText(/Error fetching prompt: Server Error/i)).toBeInTheDocument();
    });
    
    test('displays a generic error message if fetching fails and error format is unexpected', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => "Unexpected error format", // Not an object with .error
        });
        render(<AdminPromptPage />);
  
        expect(await screen.findByText(/Error fetching prompt: HTTP error! status: 500/i)).toBeInTheDocument();
      });

    test('allows admin to update prompt text and save', async () => {
      const initialPrompt = 'Initial prompt';
      const updatedPromptText = 'This is the updated master prompt';
      
      mockFetch.mockResolvedValueOnce({ // Initial GET
        ok: true,
        json: async () => ({ promptText: initialPrompt }),
      });
      
      render(<AdminPromptPage />);
      
      const textarea = await screen.findByDisplayValue(initialPrompt);
      fireEvent.change(textarea, { target: { value: updatedPromptText } });
      expect(textarea).toHaveValue(updatedPromptText);

      // Mock POST response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ promptText: updatedPromptText }),
      });

      const saveButton = screen.getByRole('button', { name: /Save Master Prompt/i });
      fireEvent.click(saveButton);

      expect(await screen.findByText('Master prompt updated successfully!')).toBeInTheDocument();
      expect(mockFetch).toHaveBeenCalledTimes(2); // Initial GET + POST
      expect(mockFetch).toHaveBeenLastCalledWith('/api/admin/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promptText: updatedPromptText }),
      });
      // Textarea should still have the updated value
      expect(screen.getByDisplayValue(updatedPromptText)).toBeInTheDocument();
    });

    test('shows an error message if saving the prompt fails', async () => {
      const initialPrompt = 'Initial prompt to fail save';
      mockFetch.mockResolvedValueOnce({ // Initial GET
        ok: true,
        json: async () => ({ promptText: initialPrompt }),
      });

      render(<AdminPromptPage />);
      const textarea = await screen.findByDisplayValue(initialPrompt);
      fireEvent.change(textarea, { target: { value: 'Attempting to save' } });
      
      // Mock POST failure
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Failed to save' }),
      });

      const saveButton = screen.getByRole('button', { name: /Save Master Prompt/i });
      fireEvent.click(saveButton);

      expect(await screen.findByText(/Error updating prompt: Failed to save/i)).toBeInTheDocument();
    });
    
    test('shows a generic error if saving fails and error format is unexpected', async () => {
        const initialPrompt = 'Initial prompt for generic save failure';
        mockFetch.mockResolvedValueOnce({ // Initial GET
          ok: true,
          json: async () => ({ promptText: initialPrompt }),
        });
  
        render(<AdminPromptPage />);
        const textarea = await screen.findByDisplayValue(initialPrompt);
        fireEvent.change(textarea, { target: { value: 'Attempting another save' } });
        
        // Mock POST failure with unexpected error format
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 400, // e.g. bad request
          json: async () => "Malformed request body", // Not an object with .error
        });
  
        const saveButton = screen.getByRole('button', { name: /Save Master Prompt/i });
        fireEvent.click(saveButton);
  
        expect(await screen.findByText(/Error updating prompt: HTTP error! status: 400/i)).toBeInTheDocument();
      });
  });
});
