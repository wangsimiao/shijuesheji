import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

type ChoiceAccumulator = {
  index: number;
  role: string;
  content: string;
  imageUrls: Set<string>;
  finishReason?: unknown;
};

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

function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (!part || typeof part !== 'object') return '';
      const record = part as Record<string, unknown>;
      if (typeof record.text === 'string') return record.text;
      if (typeof record.content === 'string') return record.content;
      return '';
    })
    .join('');
}

function pushImageUrl(target: Set<string>, value: unknown) {
  if (typeof value !== 'string') return;
  const trimmed = value.trim();
  if (!trimmed) return;
  target.add(trimmed);
}

function collectImageUrls(input: unknown, target: Set<string>) {
  if (!Array.isArray(input)) return;
  for (const item of input) {
    if (typeof item === 'string') {
      pushImageUrl(target, item);
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    if (typeof record.b64_json === 'string' && record.b64_json.trim()) {
      target.add(`data:image/png;base64,${record.b64_json.trim()}`);
      continue;
    }
    if (typeof record.url === 'string') {
      pushImageUrl(target, record.url);
      continue;
    }
    if (typeof record.image === 'string') {
      pushImageUrl(target, record.image);
      continue;
    }
    if (typeof record.data === 'string') {
      pushImageUrl(target, record.data);
      continue;
    }
    if (record.image_url && typeof record.image_url === 'object') {
      const nested = record.image_url as Record<string, unknown>;
      if (typeof nested.url === 'string') {
        pushImageUrl(target, nested.url);
      }
    } else if (typeof record.image_url === 'string') {
      pushImageUrl(target, record.image_url);
    }
  }
}

function getChoiceAccumulator(map: Map<number, ChoiceAccumulator>, index: number) {
  const existed = map.get(index);
  if (existed) return existed;
  const created: ChoiceAccumulator = {
    index,
    role: 'assistant',
    content: '',
    imageUrls: new Set<string>(),
  };
  map.set(index, created);
  return created;
}

function mergeChoiceMessage(target: ChoiceAccumulator, message: Record<string, unknown>) {
  if (typeof message.role === 'string' && message.role.trim()) {
    target.role = message.role.trim();
  }
  const contentText = extractTextFromContent(message.content);
  if (contentText) {
    target.content += contentText;
  }
  collectImageUrls(message.images, target.imageUrls);
  if (Array.isArray(message.image)) {
    collectImageUrls(message.image, target.imageUrls);
  } else {
    collectImageUrls([message.image], target.imageUrls);
  }
}

function mergeChoiceDelta(target: ChoiceAccumulator, delta: Record<string, unknown>) {
  if (typeof delta.role === 'string' && delta.role.trim()) {
    target.role = delta.role.trim();
  }
  const contentText = extractTextFromContent(delta.content);
  if (contentText) {
    target.content += contentText;
  }
  collectImageUrls(delta.images, target.imageUrls);
  if (Array.isArray(delta.image)) {
    collectImageUrls(delta.image, target.imageUrls);
  } else {
    collectImageUrls([delta.image], target.imageUrls);
  }
}

function parseEventStreamPayload(raw: string): Record<string, unknown> | null {
  if (!/(^|\r?\n)data:\s*/.test(raw)) {
    return null;
  }

  const root: Record<string, unknown> = {};
  const choices = new Map<number, ChoiceAccumulator>();
  let hasChunk = false;

  for (const block of raw.split(/\r?\n\r?\n/)) {
    const dataLines = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart());
    if (!dataLines.length) continue;

    const dataText = dataLines.join('\n').trim();
    if (!dataText || dataText === '[DONE]') continue;

    let payload: Record<string, unknown> | null = null;
    try {
      const parsed = JSON.parse(dataText) as unknown;
      if (parsed && typeof parsed === 'object') {
        payload = parsed as Record<string, unknown>;
      }
    } catch {
      continue;
    }
    if (!payload) continue;

    hasChunk = true;
    if (root.id === undefined && payload.id !== undefined) root.id = payload.id;
    if (root.object === undefined && payload.object !== undefined) root.object = payload.object;
    if (root.model === undefined && payload.model !== undefined) root.model = payload.model;
    if (root.created === undefined && payload.created !== undefined) root.created = payload.created;
    if (payload.error !== undefined) root.error = payload.error;
    if (payload.usage !== undefined) root.usage = payload.usage;

    const chunkChoices = Array.isArray(payload.choices) ? payload.choices : [];
    for (const chunkChoice of chunkChoices) {
      if (!chunkChoice || typeof chunkChoice !== 'object') continue;
      const choice = chunkChoice as Record<string, unknown>;
      const index = typeof choice.index === 'number' && Number.isFinite(choice.index) ? choice.index : 0;
      const target = getChoiceAccumulator(choices, index);

      if (choice.message && typeof choice.message === 'object') {
        mergeChoiceMessage(target, choice.message as Record<string, unknown>);
      }
      if (choice.delta && typeof choice.delta === 'object') {
        mergeChoiceDelta(target, choice.delta as Record<string, unknown>);
      }
      if (typeof choice.text === 'string') {
        target.content += choice.text;
      }
      if (choice.finish_reason !== undefined) {
        target.finishReason = choice.finish_reason;
      }
    }
  }

  if (!hasChunk) {
    return null;
  }

  if (choices.size > 0) {
    root.choices = Array.from(choices.values())
      .sort((a, b) => a.index - b.index)
      .map((choice) => ({
        index: choice.index,
        message: {
          role: choice.role || 'assistant',
          content: choice.content,
          ...(choice.imageUrls.size
            ? {
                images: Array.from(choice.imageUrls).map((url) => ({
                  image_url: { url },
                })),
              }
            : {}),
        },
        finish_reason: choice.finishReason ?? null,
      }));
  }

  return root;
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: './',
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
              const contentType = (upstreamResponse.headers.get('content-type') || '').toLowerCase();
              let parsed: unknown = {};
              if (raw) {
                const normalizedSse =
                  contentType.includes('text/event-stream') ||
                  raw.includes('\ndata:') ||
                  raw.startsWith('data:')
                    ? parseEventStreamPayload(raw)
                    : null;
                if (normalizedSse) {
                  parsed = normalizedSse;
                } else {
                  try {
                    parsed = JSON.parse(raw);
                  } catch {
                    parsed = { message: raw };
                  }
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
