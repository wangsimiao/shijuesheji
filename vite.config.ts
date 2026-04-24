import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

async function readJsonBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf-8').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'local-api-proxy',
        configureServer(server) {
          server.middlewares.use('/api/proxy', async (req, res) => {
            if (req.method !== 'POST') {
              sendJson(res, 405, { message: 'Method Not Allowed' });
              return;
            }
            const body = await readJsonBody(req);
            const targetUrl = typeof body?.targetUrl === 'string' ? body.targetUrl.trim() : '';
            if (!targetUrl) {
              sendJson(res, 400, { message: 'Invalid targetUrl' });
              return;
            }
            try {
              const upstreamResponse = await fetch(targetUrl, {
                method: typeof body?.method === 'string' ? body.method.toUpperCase() : 'POST',
                headers: typeof body?.headers === 'object' && body.headers ? body.headers : {},
                body:
                  body?.body !== undefined &&
                  (typeof body?.method !== 'string' || !['GET', 'HEAD'].includes(body.method.toUpperCase()))
                    ? JSON.stringify(body.body)
                    : undefined,
              });
              const raw = await upstreamResponse.text();
              let parsed: unknown = {};
              if (raw) {
                try {
                  parsed = JSON.parse(raw);
                } catch {
                  parsed = { message: raw };
                }
              }
              sendJson(res, upstreamResponse.status, parsed);
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error || 'unknown');
              sendJson(res, 502, { message: `Proxy request failed: ${message}` });
            }
          });
        },
      },
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
