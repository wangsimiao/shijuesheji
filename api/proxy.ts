type ProxyPayload = {
  targetUrl?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
};

function readPayload(req: any): ProxyPayload {
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

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ message: 'Method Not Allowed' });
    return;
  }

  const payload = readPayload(req);
  const targetUrl = typeof payload.targetUrl === 'string' ? payload.targetUrl.trim() : '';
  if (!targetUrl || !isValidTargetUrl(targetUrl)) {
    res.status(400).json({ message: 'Invalid targetUrl' });
    return;
  }

  const upstreamMethod = (payload.method || 'POST').toUpperCase();
  const headers: Record<string, string> = {};
  if (payload.headers && typeof payload.headers === 'object') {
    for (const [key, value] of Object.entries(payload.headers)) {
      if (!value) continue;
      const normalizedKey = key.toLowerCase();
      if (normalizedKey === 'host' || normalizedKey === 'content-length') continue;
      headers[key] = String(value);
    }
  }

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
    let parsed: unknown = null;
    if (raw) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = { message: raw };
      }
    }
    res.status(upstreamResponse.status).json(parsed ?? {});
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || 'unknown');
    res.status(502).json({ message: `Proxy request failed: ${message}` });
  }
}
