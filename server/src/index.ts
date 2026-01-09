import express from 'express';
import cors from 'cors';
import { config } from './config';
import { handleStripeWebhook } from './webhooks/stripe';
import checkoutRoutes from './routes/checkout';
import dashboardRoutes from './routes/dashboard';
import activityRoutes from './routes/activity';
import tenantsRoutes from './routes/tenants';
import maintenanceRoutes from './routes/maintenance';
import applicationsRoutes from './routes/applications';
import hvacRoutes from './routes/hvac';
import showingsRoutes from './routes/showings';
import paymentsRoutes from './routes/payments';
import disbursementsRoutes from './routes/disbursements';
import messagesRoutes from './routes/messages';
import communicationsRoutes from './routes/communications';
import analyticsRoutes from './routes/analytics';
import demoRoutes from './routes/demo';
import systemRoutes from './routes/system';
import { errorHandler } from './middleware/errorHandler';
import { rateLimiters } from './middleware/rateLimiter';
import { startJobs, stopJobs } from './jobs';

const app = express();

// Trust proxy - required for rate limiting and IP detection on Railway
app.set('trust proxy', 1);

// CORS configuration
app.use(
  cors({
    origin: config.frontendUrl,
    credentials: true,
  })
);

// Root endpoint - API info
app.get('/', (_req, res) => {
  res.json({
    name: 'Property Management API',
    version: '2.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      dashboard: '/api/dashboard',
      activity: '/api/activity',
      tenants: '/api/tenants',
      maintenance: '/api/maintenance',
      applications: '/api/applications',
      hvac: '/api/hvac',
      showings: '/api/showings',
      payments: '/api/payments',
      disbursements: '/api/disbursements',
      messages: '/api/messages',
      communications: '/api/communications',
      analytics: '/api/analytics',
      demo: '/api/demo',
      system: '/api/system',
      checkout: '/api/checkout',
      webhook: '/webhooks/stripe'
    },
    timestamp: new Date().toISOString(),
  });
});

// Health check endpoint (no rate limiting)
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
  });
});

// Stripe webhook endpoint - MUST use raw body + rate limiting
app.post(
  '/webhooks/stripe',
  rateLimiters.webhook,
  express.raw({ type: 'application/json' }),
  handleStripeWebhook
);

// JSON parser for other routes
app.use(express.json({ limit: '10mb' }));

// General API rate limiting
app.use('/api', rateLimiters.api);

// API routes
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/tenants', tenantsRoutes);
app.use('/api/maintenance', maintenanceRoutes);
app.use('/api/applications', applicationsRoutes);
app.use('/api/hvac', hvacRoutes);
app.use('/api/showings', showingsRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/disbursements', disbursementsRoutes);
app.use('/api/communications', communicationsRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/demo', demoRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/system', systemRoutes);
app.use('/api', checkoutRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Centralized error handler (MUST be last)
app.use(errorHandler);

// Graceful shutdown handling
const server = app.listen(config.port, () => {
  console.log(`🚀 Server running on port ${config.port}`);
  console.log(`📝 Environment: ${config.nodeEnv}`);
  console.log(`🌐 Frontend URL: ${config.frontendUrl}`);
  console.log(`✅ Ready to handle requests`);

  // Start background jobs
  startJobs();
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  stopJobs();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  stopJobs();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
