'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

export default function AdminPromptPage() {
  const { data: session, status } = useSession();
  const [promptText, setPromptText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (status === 'authenticated' && session?.user?.type === 'admin') {
      setIsLoading(true);
      fetch('/api/admin/prompt')
        .then(async (res) => {
          if (!res.ok) {
            const errorData = await res.json().catch(() => ({ error: 'Failed to fetch prompt data.' }));
            throw new Error(errorData.error || `HTTP error! status: ${res.status}`);
          }
          return res.json();
        })
        .then((data) => {
          setPromptText(data.promptText);
          setMessage(null);
        })
        .catch((error) => {
          setMessage({ type: 'error', text: `Error fetching prompt: ${error.message}` });
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [session, status]);

  const handleSave = async () => {
    setIsLoading(true);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/prompt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ promptText }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to save prompt data.' }));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setPromptText(data.promptText);
      setMessage({ type: 'success', text: 'Master prompt updated successfully!' });
    } catch (error) {
      setMessage({ type: 'error', text: `Error updating prompt: ${error.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  if (status === 'loading') {
    return <div className="p-4">Loading session...</div>;
  }

  if (!session || session.user?.type !== 'admin') {
    return (
      <div className="p-4 text-red-500">
        Access Denied. You do not have permission to view this page.
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold">Manage Master Prompt</h1>
      
      {message && (
        <div
          className={`p-3 rounded-md text-sm ${
            message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}
        >
          {message.text}
        </div>
      )}

      <div>
        <Label htmlFor="master-prompt" className="block text-sm font-medium text-gray-700 mb-1">
          Master Prompt Text
        </Label>
        <Textarea
          id="master-prompt"
          value={promptText}
          onChange={(e) => setPromptText(e.target.value)}
          placeholder="Enter the master prompt here..."
          rows={10}
          className="w-full border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          disabled={isLoading}
        />
        <p className="mt-1 text-xs text-gray-500">
          This prompt will be used as the base instruction for the AI.
        </p>
      </div>

      <Button
        onClick={handleSave}
        disabled={isLoading}
        className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
      >
        {isLoading ? 'Saving...' : 'Save Master Prompt'}
      </Button>
    </div>
  );
}
