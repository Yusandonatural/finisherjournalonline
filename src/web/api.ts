export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const body = opts.body === undefined ? undefined : JSON.stringify(opts.body);
  const res = await fetch('/api' + path, {
    method: opts.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', 'x-fj': '1' },
    body,
    credentials: 'same-origin',
    // ページを閉じる直前の保存も届くように（keepalive は 64KB まで）
    keepalive: !!body && new Blob([body]).size < 60_000,
  });
  if (res.status === 401) {
    location.href = '/login';
    throw new ApiError(401, 'ログインしてください');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (json as any).error ?? `エラー (${res.status})`);
  return json as T;
}

export const post = <T = any>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body: body ?? {} });
export const put = <T = any>(path: string, body?: unknown) => api<T>(path, { method: 'PUT', body: body ?? {} });
export const patch = <T = any>(path: string, body?: unknown) => api<T>(path, { method: 'PATCH', body: body ?? {} });
export const del = <T = any>(path: string) => api<T>(path, { method: 'DELETE' });
