const BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const j = await res.json();
      if (j?.detail) msg = String(j.detail);
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export type CoachIssue = { type: string; original: string; replacement: string; explanation: string };
export type CoachResult = { score: number; summary: string; issues: CoachIssue[]; tips: string[] };

export const api = {
  coach: (text: string, mode: "writing" | "code", language: string) =>
    req<CoachResult>("/ai/coach", { method: "POST", body: JSON.stringify({ text, mode, language }) }),
  syncPush: (sync_id: string, docs: unknown[]) =>
    req<{ sync_id: string; count: number; updated_at: string }>("/sync/push", { method: "POST", body: JSON.stringify({ sync_id, docs }) }),
  syncPull: (sync_id: string) =>
    req<{ sync_id: string; docs: any[]; updated_at: string | null }>(`/sync/pull/${encodeURIComponent(sync_id)}`),
};
