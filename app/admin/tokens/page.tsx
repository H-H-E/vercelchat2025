import { auth } from '@/app/(auth)/auth';
import { redirect } from 'next/navigation';
import type { TokenUsageRow } from '@/lib/db/queries';

async function getTokenUsageData(): Promise<Array<TokenUsageRow>> {
  // In a real app, you'd fetch from your API endpoint.
  // For RSCs, you might call the query function directly if preferred,
  // but fetching from the API route exercises the full flow and admin guard on API.
  // This example will fetch from the API route.
  // Ensure NEXT_PUBLIC_URL or similar is set for server-side fetches, or use relative path if possible.
  // For simplicity here, assuming relative fetch works or absolute URL is configured.
  // This fetch needs to be fixed if running in an env without absolute URL context for server components.
  // Using a direct query call for simplicity in this step as fetch setup can be tricky in RSC dev.

  // For now, let's try to fetch from the API route.
  // This requires the server to be able to fetch its own endpoints.
  // This might need an absolute URL.
  const appUrl = process.env.NEXTAUTH_URL || process.env.VERCEL_URL || 'http://localhost:3000';

  try {
    const res = await fetch(`${appUrl}/api/admin/tokens`, {
      cache: 'no-store', // Ensure fresh data
      headers: {
        // If your API needs cookies for auth, this is complex from RSC.
        // The API guard uses next-auth's auth(), which should work if cookies are implicitly passed
        // by the server's fetch, or if auth() can resolve session without direct cookie header.
        // For a robust solution, direct DB query or a shared service function is better from RSC.
      }
    });

    if (!res.ok) {
      if (res.status === 403) {
        console.error('Access denied to token usage API.');
        return []; // Or throw an error to be caught below
      }
      throw new Error(`Failed to fetch token usage: ${res.statusText}`);
    }
    return res.json();
  } catch (error) {
    console.error("Error fetching token usage data for page:", error);
    // Return empty array or handle error appropriately for the page
    return [];
  }
}


export default async function AdminTokenDashboardPage() {
  const session = await auth();

  if (!session?.user || session.user.type !== 'admin') {
    // Or show a more user-friendly "Access Denied" component
    redirect('/'); // Redirect to homepage or login
  }

  const usageData = await getTokenUsageData();

  return (
    <div style={{ padding: '20px' }}>
      <h1>Admin Token Usage Dashboard</h1>
      <h2>Token Usage Today</h2>
      {usageData.length === 0 ? (
        <p>No token usage data for today, or you might not have access to the API.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ border: '1px solid black', padding: '8px', textAlign: 'left' }}>User Email</th>
              <th style={{ border: '1px solid black', padding: '8px', textAlign: 'left' }}>Prompt Tokens</th>
              <th style={{ border: '1px solid black', padding: '8px', textAlign: 'left' }}>Completion Tokens</th>
              <th style={{ border: '1px solid black', padding: '8px', textAlign: 'left' }}>Total Tokens</th>
            </tr>
          </thead>
          <tbody>
            {usageData.map((row, index) => (
              <tr key={row.email || index}>
                <td style={{ border: '1px solid black', padding: '8px' }}>{row.email || 'N/A'}</td>
                <td style={{ border: '1px solid black', padding: '8px' }}>{row.total_prompt_tokens}</td>
                <td style={{ border: '1px solid black', padding: '8px' }}>{row.total_completion_tokens}</td>
                <td style={{ border: '1px solid black', padding: '8px' }}>{row.total_tokens}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
