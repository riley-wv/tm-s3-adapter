export async function api<T = unknown>(path: string, options: RequestInit & { body?: string } = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };
  if (options.body !== undefined && !headers['content-type']) {
    headers['content-type'] = 'application/json';
  }

  const res = await fetch(path, { ...options, headers });
  const text = await res.text();
  let payload: T | null = null;
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = null; }
  }

  if (!res.ok) {
    const err = payload as Record<string, string> | null;
    throw new Error(err?.error || err?.message || `Request failed (${res.status})`);
  }

  return payload as T;
}
