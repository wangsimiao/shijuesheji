import express from 'express';
import { proxyHandler } from './proxy.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '25mb' }));

  app.get('/healthz', (_req, res) => {
    res.json({
      ok: true,
      service: 'wuxian-api',
      time: new Date().toISOString(),
    });
  });

  app.all('/api/proxy', proxyHandler);

  return app;
}
