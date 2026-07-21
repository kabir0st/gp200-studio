/**
 * The app's first real network client: talks to the message-wall API served by
 * worker/index.js (/api/*). Everything else in the app is same-origin static
 * asset loading; durable state otherwise lives on the device or in files.
 *
 * API base resolution:
 *  - Default: import.meta.env.BASE_URL — `/gp200studio/` in a prod build, `/` in
 *    dev — so fetches are same-origin and need no CORS.
 *  - Override: VITE_FORUM_API_BASE lets `npm run dev` (no Worker running) point
 *    at a deployed Worker to develop the UI against live data.
 *
 * Errors are normalised to a thrown ForumApiError with a human-readable message
 * so the UI can show it inline; nothing here rejects with a raw fetch error.
 */

export interface ForumMessage {
  id: number;
  name: string;
  text: string;
  created_at: number;
}

const RAW_BASE = import.meta.env.VITE_FORUM_API_BASE ?? import.meta.env.BASE_URL ?? '/';
// Collapse a possible trailing slash so `${API_BASE}/api/...` never doubles up.
const API_BASE = RAW_BASE.replace(/\/$/, '');

export class ForumApiError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, init);
  } catch {
    throw new ForumApiError('Could not reach the server. Check your connection.');
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Non-JSON body (e.g. an HTML error page); handled by the status check below.
  }

  if (!res.ok) {
    const message =
      (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : null) ?? `Request failed (${res.status})`;
    throw new ForumApiError(message);
  }

  return body as T;
}

/** Fetch the latest messages (newest first) plus the visit counter. */
export function fetchMessages(): Promise<{ messages: ForumMessage[]; visits: number }> {
  return request('/api/messages');
}

/** Post a new message; the server validates, filters profanity, and returns the row. */
export function postMessage(name: string, text: string): Promise<ForumMessage> {
  return request('/api/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, text }),
  });
}

/** Increment and return the page-visit counter. */
export function recordVisit(): Promise<{ visits: number }> {
  return request('/api/visits', { method: 'POST' });
}
