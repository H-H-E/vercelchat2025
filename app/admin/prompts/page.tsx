'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation'; // For redirect

// Define AdminPrompt type (as it might not be directly importable from server files)
interface AdminPrompt {
  id: string;
  text: string;
  active: boolean;
  version: number;
  createdAt: string; // Dates will be strings from JSON
  createdBy: string | null;
}

export default function AdminPromptsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [prompts, setPrompts] = useState<AdminPrompt[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // States for new prompt form
  const [newPromptText, setNewPromptText] = useState('');
  const [newPromptIsActive, setNewPromptIsActive] = useState(false);

  // States for editing prompt text
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [editingPromptText, setEditingPromptText] = useState<string>('');

  // Admin Guard
  useEffect(() => {
    if (status === 'loading') return; // Wait until session is loaded
    if (!session || session.user.type !== 'admin') {
      router.push('/'); // Redirect to homepage if not admin
    }
  }, [session, status, router]);

  const fetchPrompts = async () => {
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch('/api/admin/prompts');
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to fetch prompts: ${response.statusText}`);
      }
      const data: AdminPrompt[] = await response.json();
      setPrompts(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (session?.user?.type === 'admin') { // Only fetch if admin
        fetchPrompts();
    }
  }, [session]); // Re-fetch if session changes (e.g., after login)

  const handleCreatePrompt = async (e: FormEvent) => {
    e.preventDefault();
    if (!newPromptText.trim()) {
      setError("Prompt text cannot be empty.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch('/api/admin/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newPromptText, isActive: newPromptIsActive }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to create prompt: ${response.statusText}`);
      }
      setNewPromptText('');
      setNewPromptIsActive(false);
      setSuccessMessage("Prompt created successfully!");
      await fetchPrompts(); // Refresh list
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleActive = async (promptId: string, currentIsActive: boolean) => {
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch(`/api/admin/prompts/${promptId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentIsActive }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to update prompt: ${response.statusText}`);
      }
      setSuccessMessage(`Prompt ${!currentIsActive ? 'activated' : 'deactivated'} successfully!`);
      await fetchPrompts(); // Refresh list
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartEdit = (prompt: AdminPrompt) => {
    setEditingPromptId(prompt.id);
    setEditingPromptText(prompt.text);
  };

  const handleCancelEdit = () => {
    setEditingPromptId(null);
    setEditingPromptText('');
  };

  const handleSaveEdit = async (promptId: string) => {
    if (!editingPromptText.trim()) {
      setError("Prompt text cannot be empty.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch(`/api/admin/prompts/${promptId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: editingPromptText }), // isActive is not changed here
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to update prompt text: ${response.statusText}`);
      }
      setSuccessMessage("Prompt text updated successfully!");
      setEditingPromptId(null);
      await fetchPrompts(); // Refresh list
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeletePrompt = async (promptId: string) => {
    if (!confirm('Are you sure you want to delete this prompt?')) return;
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch(`/api/admin/prompts/${promptId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to delete prompt: ${response.statusText}`);
      }
      setSuccessMessage("Prompt deleted successfully!");
      await fetchPrompts(); // Refresh list
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (status === 'loading') {
    return <p>Loading session...</p>;
  }

  if (!session || session.user.type !== 'admin') {
    // This will be handled by the useEffect redirect, but good to have a message too
    return <p>Access Denied. You must be an admin to view this page.</p>;
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>Admin System Prompts Management</h1>

      {isLoading && <p>Loading...</p>}
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}
      {successMessage && <p style={{ color: 'green' }}>{successMessage}</p>}

      <h2>Create New Prompt</h2>
      <form onSubmit={handleCreatePrompt} style={{ marginBottom: '20px', border: '1px solid #ccc', padding: '10px' }}>
        <div>
          <label htmlFor="newPromptText" style={{ display: 'block', marginBottom: '5px' }}>Prompt Text:</label>
          <textarea
            id="newPromptText"
            value={newPromptText}
            onChange={(e) => setNewPromptText(e.target.value)}
            rows={5}
            required
            style={{ width: '100%', marginBottom: '10px', padding: '5px' }}
          />
        </div>
        <div>
          <label style={{ marginRight: '10px' }}>
            <input
              type="checkbox"
              checked={newPromptIsActive}
              onChange={(e) => setNewPromptIsActive(e.target.checked)}
            />
            Set as Active Prompt
          </label>
        </div>
        <button type="submit" disabled={isLoading} style={{ padding: '8px 15px', cursor: 'pointer' }}>
          {isLoading ? 'Creating...' : 'Create Prompt'}
        </button>
      </form>

      <h2>Existing Prompts</h2>
      {prompts.length === 0 && !isLoading && <p>No prompts found.</p>}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {prompts.map((prompt) => (
          <li key={prompt.id} style={{ border: '1px solid #eee', marginBottom: '15px', padding: '15px' }}>
            {editingPromptId === prompt.id ? (
              <div>
                <textarea
                  value={editingPromptText}
                  onChange={(e) => setEditingPromptText(e.target.value)}
                  rows={5}
                  style={{ width: '100%', marginBottom: '10px', padding: '5px' }}
                />
                <button onClick={() => handleSaveEdit(prompt.id)} disabled={isLoading} style={{ marginRight: '5px', padding: '5px' }}>Save</button>
                <button onClick={handleCancelEdit} disabled={isLoading} style={{ padding: '5px' }}>Cancel</button>
              </div>
            ) : (
              <p style={{ whiteSpace: 'pre-wrap', margin: '0 0 10px 0' }}>{prompt.text}</p>
            )}
            <p style={{ fontSize: '0.9em', color: '#555', margin: '5px 0' }}>
              <strong>Active:</strong> {prompt.active ? 'Yes' : 'No'} |
              <strong> Version:</strong> {prompt.version} |
              <strong> Created At:</strong> {new Date(prompt.createdAt).toLocaleString()}
            </p>
            <div style={{ marginTop: '10px' }}>
              <button
                onClick={() => handleToggleActive(prompt.id, prompt.active)}
                disabled={isLoading || (prompt.active && prompts.filter(p => p.active).length <= 1)} // Prevent deactivating if it's the only active one (optional UX)
                style={{ marginRight: '5px', padding: '5px 10px', cursor: 'pointer' }}
              >
                {prompt.active ? 'Set Inactive' : 'Set Active'}
              </button>
              {editingPromptId === prompt.id ? null : (
                <button onClick={() => handleStartEdit(prompt)} disabled={isLoading} style={{ marginRight: '5px', padding: '5px 10px', cursor: 'pointer' }}>Edit Text</button>
              )}
              <button
                onClick={() => handleDeletePrompt(prompt.id)}
                disabled={isLoading || prompt.active} // Prevent deleting active prompt (optional UX)
                style={{ padding: '5px 10px', cursor: 'pointer', backgroundColor: '#f44336', color: 'white', border: 'none' }}
              >
                Delete
              </button>
               {prompt.active && <span style={{ marginLeft: '10px', color: 'gray', fontSize: '0.8em' }}>(Cannot delete active prompt)</span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
