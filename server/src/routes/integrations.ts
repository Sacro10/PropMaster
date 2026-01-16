import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getGmailAuthUrl, exchangeGmailCode, storeGmailTokens, getGmailToken } from '../services/gmailService';
import { syncInboundGmailMessages } from '../services/communicationsService';
import { config } from '../config';

const router = Router();

const encodeState = (state: Record<string, string>) =>
  Buffer.from(JSON.stringify(state)).toString('base64url');
const decodeState = (state: string) =>
  JSON.parse(Buffer.from(state, 'base64url').toString('utf-8')) as { accountId: string; userId: string };

router.get('/gmail/status', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!req.user?.accountId || !req.user?.id) {
      res.status(400).json({ error: 'Account ID and User ID required' });
      return;
    }

    const token = await getGmailToken(req.user.accountId, req.user.id);
    res.json({ connected: Boolean(token?.refresh_token || token?.access_token), email: token?.email || null });
  } catch (error) {
    console.error('Gmail status error:', error);
    res.status(500).json({ error: 'Failed to fetch Gmail status' });
  }
});

router.post('/gmail/connect', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!req.user?.accountId || !req.user?.id) {
      res.status(400).json({ error: 'Account ID and User ID required' });
      return;
    }

    const state = encodeState({ accountId: req.user.accountId, userId: req.user.id });
    const url = getGmailAuthUrl(state);
    res.json({ url });
  } catch (error) {
    console.error('Gmail connect error:', error);
    res.status(500).json({ error: 'Failed to start Gmail OAuth' });
  }
});

router.get('/gmail/callback', async (req, res) => {
  try {
    const code = req.query.code as string | undefined;
    const state = req.query.state as string | undefined;

    if (!code || !state) {
      res.status(400).send('Missing code or state');
      return;
    }

    const { accountId, userId } = decodeState(state);
    const { tokens, email } = await exchangeGmailCode(code);

    await storeGmailTokens(accountId, userId, tokens, email);

    res.redirect(`${config.frontendUrl}/app/showings?gmail=connected`);
  } catch (error) {
    console.error('Gmail callback error:', error);
    res.redirect(`${config.frontendUrl}/app/showings?gmail=error`);
  }
});

router.post('/gmail/sync', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!req.user?.accountId || !req.user?.id) {
      res.status(400).json({ error: 'Account ID and User ID required' });
      return;
    }

    const maxResults = req.body?.maxResults ? Number(req.body.maxResults) : undefined;
    const query = typeof req.body?.query === 'string' ? req.body.query : undefined;

    const result = await syncInboundGmailMessages(req.user.accountId, req.user.id, {
      maxResults,
      query,
    });

    res.json(result);
  } catch (error) {
    console.error('Gmail sync error:', error);
    res.status(500).json({
      error: 'Failed to sync Gmail inbox',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
