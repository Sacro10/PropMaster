import { google } from 'googleapis';
import { supabaseAdmin as supabase } from '../supabase';

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email',
];

function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Missing Google OAuth configuration');
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getGmailAuthUrl(state: string) {
  const oauth2Client = getOAuthClient();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: GMAIL_SCOPES,
    state,
  });
}

export async function storeGmailTokens(
  accountId: string,
  userId: string,
  tokens: {
    access_token?: string | null;
    refresh_token?: string | null;
    expiry_date?: number | null;
  },
  email: string | null
) {
  const expiresAt = tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null;

  const { error } = await supabase
    .from('user_oauth_tokens')
    .upsert(
      {
        account_id: accountId,
        user_id: userId,
        provider: 'gmail',
        email,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'account_id,user_id,provider' }
    );

  if (error) throw error;
}

export async function getGmailToken(accountId: string, userId: string) {
  const { data, error } = await supabase
    .from('user_oauth_tokens')
    .select('access_token, refresh_token, expires_at, email')
    .eq('account_id', accountId)
    .eq('user_id', userId)
    .eq('provider', 'gmail')
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function exchangeGmailCode(code: string) {
  const oauth2Client = getOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  const { data } = await oauth2.userinfo.get();

  return { tokens, email: data.email || null };
}

export async function sendGmailMessage(params: {
  accountId: string;
  userId: string;
  to: string;
  subject: string;
  body: string;
  fromEmail?: string;
}) {
  const tokenData = await getGmailToken(params.accountId, params.userId);
  if (!tokenData?.refresh_token && !tokenData?.access_token) {
    const error = new Error('GMAIL_NOT_CONNECTED');
    throw error;
  }

  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials({
    access_token: tokenData.access_token || undefined,
    refresh_token: tokenData.refresh_token || undefined,
    expiry_date: tokenData.expires_at ? new Date(tokenData.expires_at).getTime() : undefined,
  });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  const fromEmail = tokenData.email || params.fromEmail;
  if (!fromEmail) {
    throw new Error('GMAIL_SENDER_EMAIL_MISSING');
  }

  const rawMessage = [
    `From: ${fromEmail}`,
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    params.body,
  ].join('\n');

  const encodedMessage = Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encodedMessage },
  });
}
