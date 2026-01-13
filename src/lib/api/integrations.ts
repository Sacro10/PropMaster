import { supabase } from '../supabaseClient';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('No active session');
  }
  return {
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  };
}

export async function getGmailStatus() {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE}/api/integrations/gmail/status`, { headers });
  if (!response.ok) {
    throw new Error('Failed to fetch Gmail status');
  }
  return await response.json();
}

export async function getGmailConnectUrl() {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE}/api/integrations/gmail/connect`, {
    method: 'POST',
    headers,
  });
  if (!response.ok) {
    throw new Error('Failed to start Gmail OAuth');
  }
  const data = await response.json();
  return data.url as string;
}
