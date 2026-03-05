import { URL } from 'node:url';

export function parseUrl(req) {
  return new URL(req.url, `http://${req.headers.host || 'localhost'}`);
}

export function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store'
  });
  res.end(body);
}

export function sendNoContent(res) {
  res.writeHead(204);
  res.end();
}

export function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    'content-type': 'text/plain; charset=utf-8',
    'content-length': Buffer.byteLength(text)
  });
  res.end(text);
}

export async function readJsonBody(req, maxBytes = 1024 * 1024) {
  const chunks = [];
  let total = 0;

  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) {
      const error = new Error('Request body too large');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error('Invalid JSON body');
    error.statusCode = 400;
    throw error;
  }
}

export function handleError(res, error) {
  const statusCode = error.statusCode || 500;
  sendJson(res, statusCode, {
    error: error.message || 'Internal server error'
  });
}
