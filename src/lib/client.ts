"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Agreement,
  ChatTurn,
  ConflictMap,
  FollowUpResult,
  PerspectivePrediction,
  ResolutionOption,
  Stance,
  StructuredPerspective,
} from "@/lib/types";

// ---------- Token storage (participant credential; never shared) ----------

export function getToken(code: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(`jj-token-${code.toUpperCase()}`);
}
export function setToken(code: string, token: string) {
  window.localStorage.setItem(`jj-token-${code.toUpperCase()}`, token);
}

// ---------- History cache ----------

export interface HistoryEntry {
  code: string;
  title: string;
  side: string;
  status: string;
  at: number;
}

export function recordHistory(entry: HistoryEntry) {
  try {
    const raw = window.localStorage.getItem("jj-history");
    const list: HistoryEntry[] = raw ? JSON.parse(raw) : [];
    const next = [entry, ...list.filter((e) => e.code !== entry.code)].slice(0, 30);
    window.localStorage.setItem("jj-history", JSON.stringify(next));
  } catch {
    /* history is best-effort */
  }
}
export function readHistory(): HistoryEntry[] {
  try {
    return JSON.parse(window.localStorage.getItem("jj-history") ?? "[]");
  } catch {
    return [];
  }
}
export function removeFromHistory(code: string) {
  window.localStorage.setItem(
    "jj-history",
    JSON.stringify(readHistory().filter((e) => e.code !== code)),
  );
}

// ---------- Session projection (mirrors GET /api/sessions/[code]) ----------

export interface SessionState {
  session: {
    code: string;
    title: string;
    relationship: string;
    mode: string;
    status: string;
    tone: string;
    createdAt: string;
  };
  me: {
    side: "A" | "B";
    stage: string;
    displayName: string;
    safetyFlag: boolean;
    perspective: StructuredPerspective | null;
    predictions: PerspectivePrediction | null;
    soloSummary: {
      known: string[];
      unknown: string[];
      interpretation: string;
      feeling: string;
      suggestedAsk: string;
    } | null;
  };
  partnerJoined: boolean;
  partnerStage: "done" | "working" | null;
  partnerSafety: boolean;
  messages: ChatTurn[];
  map: ConflictMap | null;
  mapFeedback: Record<string, string>;
  resolutions: ResolutionOption[];
  votes: Record<string, { optionId: string; stance: Stance; note?: string }>;
  noOverlap: boolean;
  agreement: Agreement | null;
  agreementVotes: Record<string, { verdict: string; note?: string }>;
  followUp: FollowUpResult | null;
}

async function fetchState(code: string): Promise<SessionState> {
  const token = getToken(code);
  if (!token) throw new Error("NO_TOKEN");
  const res = await fetch(`/api/sessions/${code}`, {
    headers: { "x-participant-token": token },
    cache: "no-store",
  });
  if (res.status === 401) throw new Error("BAD_TOKEN");
  if (!res.ok) throw new Error("Server error");
  const data = (await res.json()) as SessionState;
  recordHistory({
    code: data.session.code,
    title: data.session.title,
    side: data.me.side,
    status: data.session.status,
    at: Date.now(),
  });
  return data;
}

export async function postAction(
  code: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string; safety?: boolean; corrected?: boolean; soloDone?: boolean }> {
  const token = getToken(code);
  const res = await fetch(`/api/sessions/${code}/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-participant-token": token ?? "" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.error ?? "Something went wrong" };
  return { ok: true, ...data };
}

/** Polls session state (lightweight realtime; swap for WebSocket/Supabase later). */
export function useSession(code: string) {
  const [state, setState] = useState<SessionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await fetchState(code);
      setState(s);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    }
  }, [code]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refresh is async; setState happens after await, not synchronously
    void refresh();
    timer.current = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 3000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [refresh]);

  const act = useCallback(
    async (body: Record<string, unknown>) => {
      const res = await postAction(code, body);
      await refresh();
      return res;
    },
    [code, refresh],
  );

  return { state, error, refresh, act };
}
