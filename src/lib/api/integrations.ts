import { fetchWithAuthRetry } from './client';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export async function getGmailStatus() {
  const response = await fetchWithAuthRetry(`${API_BASE}/api/integrations/gmail/status`);
  if (!response.ok) {
    throw new Error('Failed to fetch Gmail status');
  }
  return await response.json();
}

export async function getGmailConnectUrl() {
  const response = await fetchWithAuthRetry(`${API_BASE}/api/integrations/gmail/connect`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('Failed to start Gmail OAuth');
  }
  const data = await response.json();
  return data.url as string;
}

export async function syncGmailInbox(params?: { maxResults?: number; query?: string }) {
  const response = await fetchWithAuthRetry(`${API_BASE}/api/integrations/gmail/sync`, {
    method: 'POST',
    body: JSON.stringify({
      maxResults: params?.maxResults,
      query: params?.query,
    }),
  });
  if (!response.ok) {
    throw new Error('Failed to sync Gmail inbox');
  }
  return await response.json();
}
