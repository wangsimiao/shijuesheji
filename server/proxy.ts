import type { Request, Response } from 'express';
import fetch from 'node-fetch';
import type { RequestInit } from 'node-fetch';

type ProxyPayload = {
  targetUrl?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  provider?: 'doubao' | 'openrouter';
};

type ChoiceAccumulator = {
  index: number;
  role: string;
  content: string;
  imageUrls: Set<string>;
  finishReason?: unknown;
};

function readPayload(req: Request): ProxyPayload {
  if (req.body && typeof req.body === 'object') return req.body as ProxyPayload;
  if (typeof req.body === 'string' && req.body.trim()) {
    try {
      return JSON.parse(req.body) as ProxyPayload;
    } catch {
      return {};
    }
  }
  return {};
}

function isValidTargetUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function getEnvValue(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return '';
}

function normalizeApiBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, '').replace(/\/chat\/completions\/?$/i, '');
}

function buildApiRequestUrl(baseUrl: string, path: string) {
  const normalizedBase = normalizeApiBaseUrl(baseUrl);
  const normalizedPath = `/${path.replace(/^\/+/, '')}`;
  return `${normalizedBase}${normalizedPath}`;
}

function getRequestProvider(payload: ProxyPayload, targetUrl: string) {
  if (payload.provider === 'doubao' || payload.provider === 'openrouter') {
    return payload.provider;
  }

  try {
    const parsed = new URL(targetUrl);
    const host = parsed.hostname.toLowerCase();
    if (host.includes('volces.com')) return 'doubao';
    if (host.includes('openrouter.ai') || host.includes('zw-ai.com')) return 'openrouter';
  } catch {
    return null;
  }

  return null;
}

function resolveTargetPath(targetUrl: string, provider: 'doubao' | 'openrouter') {
  const parsed = new URL(targetUrl);
  let pathname = parsed.pathname || '/';
  if (provider === 'doubao') {
    pathname = pathname.replace(/^\/api\/v\d+(?=\/|$)/i, '');
  }
  if (provider === 'openrouter') {
    pathname = pathname.replace(/^\/api\/v\d+(?=\/|$)/i, '');
  }
  return `${pathname || '/'}${parsed.search}`;
}

function applyServerProviderConfig(payload: ProxyPayload, targetUrl: string) {
  const provider = getRequestProvider(payload, targetUrl);
  if (!provider) {
    return {
      targetUrl,
      headers: sanitizeHeaders(payload.headers),
    };
  }

  const headers = sanitizeHeaders(payload.headers);
  const baseUrl =
    provider === 'doubao'
      ? getEnvValue('DOUBAO_API_BASE_URL', 'DOUBAO_BASE_URL')
      : getEnvValue('OPENROUTER_API_BASE_URL', 'OPENROUTER_BASE_URL');
  const apiKey =
    provider === 'doubao'
      ? getEnvValue('DOUBAO_API_KEY', 'ARK_API_KEY')
      : getEnvValue('OPENROUTER_API_KEY');

  let resolvedTargetUrl = targetUrl;
  const isOpenRouterOfficialRequest =
    provider === 'openrouter' && new URL(targetUrl).hostname.toLowerCase().includes('openrouter.ai');
  if (baseUrl && !isOpenRouterOfficialRequest) {
    resolvedTargetUrl = buildApiRequestUrl(baseUrl, resolveTargetPath(targetUrl, provider));
  }
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  return {
    targetUrl: resolvedTargetUrl,
    headers,
  };
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
    if (record.imageUrl && typeof record.imageUrl === 'object') {
      const nested = record.imageUrl as Record<string, unknown>;
      pushImageUrl(target, nested.url);
    } else {
      pushImageUrl(target, record.imageUrl);
    }
    if (record.image_url && typeof record.image_url === 'object') {
      const nested = record.image_url as Record<string, unknown>;
      pushImageUrl(target, nested.url);
    } else {
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
  if (!/(^|\r?\n)data:\s*/.test(raw)) return null;

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
      const index =
        typeof choice.index === 'number' && Number.isFinite(choice.index) ? choice.index : 0;
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

  if (!hasChunk) return null;

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

function sanitizeHeaders(input: ProxyPayload['headers']) {
  const headers: Record<string, string> = {};
  if (!input || typeof input !== 'object') return headers;

  for (const [key, value] of Object.entries(input)) {
    if (!value) continue;
    const normalizedKey = key.toLowerCase();
    if (
      normalizedKey === 'host' ||
      normalizedKey === 'content-length' ||
      normalizedKey === 'connection'
    ) {
      continue;
    }
    headers[key] = String(value);
  }

  return headers;
}

export async function proxyHandler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    res.status(405).json({ message: 'Method Not Allowed' });
    return;
  }

  const payload = readPayload(req);
  const rawTargetUrl = typeof payload.targetUrl === 'string' ? payload.targetUrl.trim() : '';
  if (!rawTargetUrl || !isValidTargetUrl(rawTargetUrl)) {
    res.status(400).json({ message: 'Invalid targetUrl' });
    return;
  }

  const upstreamMethod = (payload.method || 'POST').toUpperCase();
  const { targetUrl, headers } = applyServerProviderConfig(payload, rawTargetUrl);
  const requestInit: RequestInit = {
    method: upstreamMethod,
    headers,
  };

  if (payload.body !== undefined && upstreamMethod !== 'GET' && upstreamMethod !== 'HEAD') {
    requestInit.body = JSON.stringify(payload.body);
    if (!headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json';
    }
  }

  try {
    const upstreamResponse = await fetch(targetUrl, requestInit);
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

    res.status(upstreamResponse.status).json(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || 'unknown');
    res.status(502).json({ message: `Proxy request failed: ${message}` });
  }
}
