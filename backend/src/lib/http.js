const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Fetch with AbortController timeout.
 * @returns {Promise<Response>}
 */
export async function fetchWithTimeout(url, opts = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...opts,
      signal: ctrl.signal,
      headers: {
        Accept: 'application/json',
        ...(opts.headers || {})
      }
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson(url, opts = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const res = await fetchWithTimeout(url, opts, timeoutMs);
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} for ${url}`);
    err.status = res.status;
    err.url = url;
    throw err;
  }
  return res.json();
}

/** Try URLs in order; return { data, url } or throw last error. */
export async function fetchJsonFailover(urls, opts = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  let lastErr;
  for (const url of urls) {
    try {
      const data = await fetchJson(url, opts, timeoutMs);
      return { data, url };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('All upstream URLs failed');
}

export function corsHeaders(req) {
  const origin = req?.headers?.get?.('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

export function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders
    }
  });
}
