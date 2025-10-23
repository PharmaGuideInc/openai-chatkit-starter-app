"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OpenAIChatKit } from "@openai/chatkit";

type ThreadItem = {
  id: string;
  lastUsed: number; // epoch ms
  title?: string | null;
  createdAt?: number;
  status?: string;
};

type ChatHistorySidebarProps = {
  chatkitRef: React.RefObject<OpenAIChatKit | null>;
  activeThreadId: string | null;
  onNewChat: () => void;
  onSelectThread: (id: string) => void;
  getAccessToken?: () => Promise<string | null>;
  onDeletedThread?: (id: string) => void;
  onRenamedThread?: (id: string, title: string) => void;
  titleOverrides?: Record<string, string>;
};

const STORAGE_KEY = "chatkit:threads";

function readStoredThreads(): ThreadItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => x && typeof x.id === "string" && typeof x.lastUsed === "number")
      .slice(0, 200);
  } catch {
    return [];
  }
}

function writeStoredThreads(threads: ThreadItem[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(threads));
  } catch {
    // no-op
  }
}

export function ChatHistorySidebar({
  chatkitRef,
  activeThreadId,
  onNewChat,
  onSelectThread,
  getAccessToken,
  onDeletedThread,
  onRenamedThread,
  titleOverrides,
}: ChatHistorySidebarProps) {
  const [threads, setThreads] = useState<ThreadItem[]>(() => readStoredThreads());
  const initializedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const deletedIdsRef = useRef<Set<string>>(new Set());

  // Sort newest first. Prefer server creation time; if missing, use lastUsed.
  const sorted = useMemo(() => {
    return [...threads].sort((a, b) => {
      const aCreatedMs = a.createdAt ? a.createdAt * 1000 : null;
      const bCreatedMs = b.createdAt ? b.createdAt * 1000 : null;
      const aPrimary = aCreatedMs ?? a.lastUsed ?? 0;
      const bPrimary = bCreatedMs ?? b.lastUsed ?? 0;
      return bPrimary - aPrimary;
    });
  }, [threads]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    setThreads(readStoredThreads());
  }, []);


  useEffect(() => {
    const onDocClick = () => setMenuOpenFor(null);
    window.addEventListener("click", onDocClick);
    return () => window.removeEventListener("click", onDocClick);
  }, []);

  // Fetch server-backed ChatKit history and merge into local list
  const fetchServerThreads = useCallback(async () => {
    try {
      if (!getAccessToken) return;
      setError(null);
      const token = await getAccessToken();
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 15000);
      const res = await fetch("/api/threads?limit=50", {
        method: "GET",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        signal: controller.signal,
      });
      window.clearTimeout(timeout);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || `Failed to load history (${res.status})`);
      }
      const list = (body?.threads ?? []) as Array<{
        id: string;
        title: string | null;
        created_at: number;
        status?: string;
      }>;
      setThreads((prev) => {
        const prevMap = new Map(prev.map((t) => [t.id, t] as const));
        const filtered = list.filter((t) => !deletedIdsRef.current.has(t.id));
        const next = filtered.map((t) => {
          const existing = prevMap.get(t.id);
          const createdAtSec = t.created_at || 0;
          const createdAtMs = createdAtSec * 1000;
          const lastUsed = Math.max(existing?.lastUsed ?? 0, createdAtMs || Date.now());
          return {
            id: t.id,
            title: t.title ?? null,
            createdAt: createdAtSec || undefined,
            status: t.status ?? existing?.status,
            lastUsed,
          } as ThreadItem;
        });
        writeStoredThreads(next);
        return next;
      });
    } catch (e) {
      console.error("[Sidebar] Failed to load server threads", e);
      setError(e instanceof Error ? e.message : "Failed to load history");
    }
  }, [getAccessToken]);

  useEffect(() => {
    // Initial fetch of server history
    void fetchServerThreads();
  }, [fetchServerThreads]);

  // Attach listeners to track thread changes and usage
  useEffect(() => {
    const el = chatkitRef.current;
    if (!el) return;

    const handleChange = (event: CustomEvent<{ threadId: string | null }>) => {
      const id = event.detail?.threadId ?? null;
      if (!id) return; // don't track the new thread placeholder
      if (deletedIdsRef.current.has(id)) return; // ignore events for deleted threads
      setThreads((prev) => {
        const now = Date.now();
        const map = new Map(prev.map((t) => [t.id, t] as const));
        const existing = map.get(id);
        map.set(id, {
          ...existing,
          id,
          lastUsed: existing ? Math.max(existing.lastUsed, now) : now,
        });
        const next = Array.from(map.values());
        writeStoredThreads(next);
        return next;
      });
    };

    const handleLoaded = (event: CustomEvent<{ threadId: string }>) => {
      const id = event.detail?.threadId;
      if (!id) return;
      if (deletedIdsRef.current.has(id)) return; // ignore events for deleted threads
      setThreads((prev) => {
        const now = Date.now();
        const map = new Map(prev.map((t) => [t.id, t] as const));
        const existing = map.get(id);
        map.set(id, {
          ...existing,
          id,
          lastUsed: existing ? Math.max(existing.lastUsed, now) : now,
        });
        const next = Array.from(map.values());
        writeStoredThreads(next);
        return next;
      });
      // Also refresh server titles for this thread
      void fetchServerThreads();
    };

    const handleResponseEnd = () => {
      // Refresh list after messages complete to surface newly created threads/titles
      void fetchServerThreads();
    };

    el.addEventListener("chatkit.thread.change", handleChange as EventListener);
    el.addEventListener("chatkit.thread.load.end", handleLoaded as EventListener);
    el.addEventListener("chatkit.response.end", handleResponseEnd as EventListener);

    return () => {
      el.removeEventListener("chatkit.thread.change", handleChange as EventListener);
      el.removeEventListener("chatkit.thread.load.end", handleLoaded as EventListener);
      el.removeEventListener("chatkit.response.end", handleResponseEnd as EventListener);
    };
  }, [chatkitRef, fetchServerThreads]);

  async function withAuthHeaders() {
    const token = getAccessToken ? await getAccessToken() : null;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return headers;
  }

  async function handleDelete(id: string) {
    try {
      setBusyId(id);
      setMenuOpenFor(null);
      const headers = await withAuthHeaders();
      const res = await fetch(`/api/threads/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Failed to delete (${res.status})`);

      setThreads((prev) => {
        const next = prev.filter((t) => t.id !== id);
        writeStoredThreads(next);
        return next;
      });
      deletedIdsRef.current.add(id);
      if (onDeletedThread) onDeletedThread(id);
      // Refresh from server to sync latest list
      void fetchServerThreads();
    } catch (e) {
      console.error("[Sidebar] delete failed", e);
      setError(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setBusyId(null);
    }
  }

  function startRename(id: string, currentTitle: string | null | undefined) {
    setMenuOpenFor(null);
    setEditingId(id);
    setEditingTitle(currentTitle?.trim() || "");
  }

  function cancelRename() {
    setEditingId(null);
    setEditingTitle("");
  }

  async function saveRename(id: string) {
    const title = editingTitle.trim();
    if (!title) return;
    try {
      setBusyId(id);
      setThreads((prev) => {
        const map = new Map(prev.map((t) => [t.id, t] as const));
        const existing = map.get(id);
        if (existing) {
          map.set(id, { ...existing, title });
        }
        const next = Array.from(map.values());
        writeStoredThreads(next);
        return next;
      });
      if (onRenamedThread) onRenamedThread(id, title);
      cancelRename();
    } catch (e) {
      console.error("[Sidebar] rename failed", e);
      setError(e instanceof Error ? e.message : "Failed to rename");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-900/60">
      <div className="p-3 border-b border-slate-200 dark:border-slate-800">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">History</h2>
        <button
          type="button"
          onClick={onNewChat}
          className="mt-3 w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 cursor-pointer"
        >
          New chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {error ? (
          <div className="px-2 py-2 text-xs text-red-600 dark:text-red-400">{error}</div>
        ) : null}
        {sorted.length === 0 ? (
          <div className="px-2 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
            No chats yet.
          </div>
        ) : (
          <ul className="space-y-1">
            {sorted.map((t) => {
              const isActive = activeThreadId === t.id;
              const override = titleOverrides?.[t.id];
              const label = override?.trim() || t.title?.trim() || "New chat";
              return (
                <li key={t.id} className="relative">
                  {editingId === t.id ? (
                    <div className={
                      "w-full rounded-md px-3 py-2 text-left text-sm transition " +
                      (isActive
                        ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                        : "hover:bg-slate-100 text-slate-700 dark:text-slate-200 dark:hover:bg-slate-800")
                    }>
                      <input
                        className={
                          "w-full rounded-md border border-slate-300 px-2 py-1 text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        }
                        autoFocus
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void saveRename(t.id);
                          if (e.key === "Escape") cancelRename();
                        }}
                        placeholder="Enter a title"
                      />
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => void saveRename(t.id)}
                          disabled={busyId === t.id}
                          className="rounded-md bg-slate-900 px-2 py-1 text-xs text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 cursor-pointer"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={cancelRename}
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className={
                      "group flex items-center gap-1 rounded-md transition cursor-pointer " +
                      (isActive
                        ? "bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-slate-100"
                        : "hover:bg-slate-100 text-slate-700 dark:text-slate-200 dark:hover:bg-slate-800")
                    }>
                      <button
                        type="button"
                        onClick={() => onSelectThread(t.id)}
                        className="flex-1 min-w-0 px-3 py-2 text-left text-sm cursor-pointer"
                        title={t.title ? `${t.title} (${t.id})` : "New chat"}
                      >
                        <span className="block truncate">{label}</span>
                      </button>
                      <div className="shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpenFor((curr) => (curr === t.id ? null : t.id));
                          }}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                          aria-label="More actions"
                        >
                          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                            <circle cx="10" cy="4" r="1.5" />
                            <circle cx="10" cy="10" r="1.5" />
                            <circle cx="10" cy="16" r="1.5" />
                          </svg>
                        </button>
                      </div>

                      {menuOpenFor === t.id ? (
                        <div
                          className="absolute right-2 top-9 z-20 w-32 rounded-md border border-slate-200 bg-white p-1 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900"
                          onClick={(e) => e.stopPropagation()}
                          role="menu"
                        >
                          <button
                            type="button"
                            className="block w-full rounded px-2 py-1 text-left hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            onClick={() => startRename(t.id, t.title)}
                            disabled={busyId === t.id}
                            role="menuitem"
                          >
                            Rename
                          </button>
                          <button
                            type="button"
                            className="mt-1 block w-full rounded px-2 py-1 text-left text-red-600 hover:bg-red-50 dark:hover:bg-red-950 cursor-pointer"
                            onClick={() => void handleDelete(t.id)}
                            disabled={busyId === t.id}
                            role="menuitem"
                          >
                            Delete
                          </button>
                        </div>
                      ) : null}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="p-2 text-[11px] text-slate-400 border-t border-slate-200 dark:border-slate-800 dark:text-slate-500">
        Showing server history; list cached locally.
      </div>
    </aside>
  );
}
