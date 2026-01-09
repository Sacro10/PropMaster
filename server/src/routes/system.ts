import { Router } from 'express';
import { getAiStatus } from '../services/aiClient';

const router = Router();

router.get('/ai-status', (_req, res) => {
  res.json(getAiStatus());
});

export default router;
