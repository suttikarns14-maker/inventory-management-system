import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware.js';
import { apiRouter } from './routes/index.js';

export function createApp() {
  const app = express();
  // The Angular dev proxy and the production reverse proxy run on the same host;
  // trust them so rate limiting sees the real client IP.
  app.set('trust proxy', 'loopback');
  app.use(helmet());
  // JSON only: together with SameSite=Lax cookies this blocks cross-site form posts (CSRF).
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok' } });
  });
  app.use('/api/v1', apiRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
