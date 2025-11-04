"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { ChatKit, useChatKit } from "@openai/chatkit-react";
import {
  STARTER_PROMPTS,
  PLACEHOLDER_INPUT,
  GREETING,
  CREATE_SESSION_ENDPOINT,
  WORKFLOW_ID,
  getThemeConfig,
} from "@/lib/config";
import { ErrorOverlay } from "./ErrorOverlay";
import { ChatHistorySidebar } from "./ChatHistorySidebar";
import { DisclaimerDialog } from "./DisclaimerDialog";

export type FactAction = {
  type: "save";
  factId: string;
  factText: string;
};

type ChatKitPanelProps = {
  onWidgetAction: (action: FactAction) => Promise<void>;
  onResponseEnd: () => void;
};

type ErrorState = {
  script: string | null;
  session: string | null;
  integration: string | null;
  retryable: boolean;
};

const isBrowser = typeof window !== "undefined";
const isDev = process.env.NODE_ENV !== "production";

const createInitialErrors = (): ErrorState => ({
  script: null,
  session: null,
  integration: null,
  retryable: false,
});

export function ChatKitPanel({
  onWidgetAction,
  onResponseEnd,
}: ChatKitPanelProps) {
  const { getAccessTokenSilently } = useAuth0();
  const processedFacts = useRef(new Set<string>());
  const [errors, setErrors] = useState<ErrorState>(() => createInitialErrors());
  const [isInitializingSession, setIsInitializingSession] = useState(true);
  const isMountedRef = useRef(true);
  const hasAttemptedSessionRef = useRef(false);
  const [scriptStatus, setScriptStatus] = useState<
    "pending" | "ready" | "error"
  >(() =>
    isBrowser && window.customElements?.get("openai-chatkit")
      ? "ready"
      : "pending"
  );
  const [widgetInstanceKey, setWidgetInstanceKey] = useState(0);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [showHistoryOnMobile, setShowHistoryOnMobile] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [titleOverrides, setTitleOverrides] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem("chatkit:title_overrides");
      return raw ? (JSON.parse(raw) as Record<string, string>) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("chatkit:title_overrides", JSON.stringify(titleOverrides));
      }
    } catch {
      // ignore
    }
  }, [titleOverrides]);

  const setErrorState = useCallback((updates: Partial<ErrorState>) => {
    setErrors((current) => ({ ...current, ...updates }));
  }, []);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isBrowser) {
      return;
    }

    let timeoutId: number | undefined;

    const handleLoaded = () => {
      if (!isMountedRef.current) {
        return;
      }
      setScriptStatus("ready");
      setErrorState({ script: null });
    };

    const handleError = (event: Event) => {
      console.error("Failed to load chatkit.js for some reason", event);
      if (!isMountedRef.current) {
        return;
      }
      setScriptStatus("error");
      const detail = (event as CustomEvent<unknown>)?.detail ?? "unknown error";
      setErrorState({ script: `Error: ${detail}`, retryable: false });
      setIsInitializingSession(false);
    };

    window.addEventListener("chatkit-script-loaded", handleLoaded);
    window.addEventListener(
      "chatkit-script-error",
      handleError as EventListener
    );

    if (window.customElements?.get("openai-chatkit")) {
      handleLoaded();
    } else if (scriptStatus === "pending") {
      timeoutId = window.setTimeout(() => {
        if (!window.customElements?.get("openai-chatkit")) {
          handleError(
            new CustomEvent("chatkit-script-error", {
              detail:
                "ChatKit web component is unavailable. Verify that the script URL is reachable.",
            })
          );
        }
      }, 5000);
    }

    return () => {
      window.removeEventListener("chatkit-script-loaded", handleLoaded);
      window.removeEventListener(
        "chatkit-script-error",
        handleError as EventListener
      );
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [scriptStatus, setErrorState]);

  const isWorkflowConfigured = Boolean(
    WORKFLOW_ID && !WORKFLOW_ID.startsWith("wf_replace")
  );

  useEffect(() => {
    if (!isWorkflowConfigured && isMountedRef.current) {
      setErrorState({
        session: "Set NEXT_PUBLIC_CHATKIT_WORKFLOW_ID in your .env.local file.",
        retryable: false,
      });
      setIsInitializingSession(false);
    }
  }, [isWorkflowConfigured, setErrorState]);

  const handleResetChat = useCallback(() => {
    processedFacts.current.clear();
    if (isBrowser) {
      setScriptStatus(
        window.customElements?.get("openai-chatkit") ? "ready" : "pending"
      );
    }
    setIsInitializingSession(true);
    setErrors(createInitialErrors());
    setWidgetInstanceKey((prev) => prev + 1);
  }, []);

  const getClientSecret = useCallback(
    async (currentSecret: string | null) => {
      if (isDev) {
        console.info("[ChatKitPanel] getClientSecret invoked", {
          currentSecretPresent: Boolean(currentSecret),
          workflowId: WORKFLOW_ID,
          endpoint: CREATE_SESSION_ENDPOINT,
        });
      }

      if (!isWorkflowConfigured) {
        const detail =
          "Set NEXT_PUBLIC_CHATKIT_WORKFLOW_ID in your .env.local file.";
        if (isMountedRef.current) {
          setErrorState({ session: detail, retryable: false });
          setIsInitializingSession(false);
        }
        throw new Error(detail);
      }

      if (isMountedRef.current) {
        if (!currentSecret && !hasAttemptedSessionRef.current) {
          setIsInitializingSession(true);
          hasAttemptedSessionRef.current = true;
        }
        // Keep any previous error visible until we succeed.
      }

      try {
        let token: string | null = null;
        try {
          const audience = process.env.NEXT_PUBLIC_AUTH0_AUDIENCE;
          const tokenPromise = getAccessTokenSilently(
            audience ? { authorizationParams: { audience } } : undefined
          );
          token = (await Promise.race([
            tokenPromise,
            new Promise<string>((_, reject) =>
              setTimeout(() => reject(new Error("Token timeout")), 8000)
            ),
          ]).catch((e) => {
            console.error("Failed to obtain access token", e);
            return null;
          })) as string | null;
        } catch (tokenErr) {
          console.error("Failed to obtain access token", tokenErr);
          // We'll continue; backend will reject if missing.
        }

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }

        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 25000);

        const response = await fetch(CREATE_SESSION_ENDPOINT, {
          method: "POST",
          headers,
          signal: controller.signal,
          body: JSON.stringify({
            workflow: { id: WORKFLOW_ID },
            chatkit_configuration: {
              // enable attachments
              file_upload: {
                enabled: true,
              },
            },
          }),
        });
        window.clearTimeout(timeoutId);

        const raw = await response.text();

        if (isDev) {
          console.info("[ChatKitPanel] createSession response", {
            status: response.status,
            ok: response.ok,
            bodyPreview: raw.slice(0, 1600),
          });
        }

        let data: Record<string, unknown> = {};
        if (raw) {
          try {
            data = JSON.parse(raw) as Record<string, unknown>;
          } catch (parseError) {
            console.error(
              "Failed to parse create-session response",
              parseError
            );
          }
        }

        if (!response.ok) {
          const detail = extractErrorDetail(data, response.statusText);
          console.error("Create session request failed", {
            status: response.status,
            body: data,
          });
          throw new Error(detail);
        }

        const clientSecret = data?.client_secret as string | undefined;
        if (!clientSecret) {
          throw new Error("Missing client secret in response");
        }

        if (isMountedRef.current) {
          setErrorState({ session: null, integration: null });
        }

        return clientSecret;
      } catch (error) {
        console.error("Failed to create ChatKit session", error);
        const detail =
          error instanceof Error
            ? error.message
            : "Unable to start ChatKit session.";
        if (isMountedRef.current) {
          setErrorState({ session: detail, retryable: false });
        }
        throw error instanceof Error ? error : new Error(detail);
      } finally {
        if (isMountedRef.current && !currentSecret) {
          setIsInitializingSession(false);
        }
      }
    },
    [isWorkflowConfigured, setErrorState, getAccessTokenSilently]
  );

  const chatkit = useChatKit({
    api: { getClientSecret },
    theme: {
      colorScheme: "light",
      ...getThemeConfig(),
    },
    header: {
      enabled: true,
      title: {
        enabled: true,
        text: activeThreadId ? titleOverrides[activeThreadId] ?? undefined : undefined,
      },
    },
    history: {
      // We'll render our own persistent sidebar next to the chat UI
      enabled: false,
    },
    startScreen: {
      greeting: GREETING,
      prompts: STARTER_PROMPTS,
    },
    composer: {
      placeholder: PLACEHOLDER_INPUT,
      attachments: {
        // Enable attachments
        enabled: true,
      },
    },
    threadItemActions: {
      feedback: false,
    },
    onClientTool: async (invocation: {
      name: string;
      params: Record<string, unknown>;
    }) => {
      if (invocation.name === "record_fact") {
        const id = String(invocation.params.fact_id ?? "");
        const text = String(invocation.params.fact_text ?? "");
        if (!id || processedFacts.current.has(id)) {
          return { success: true };
        }
        processedFacts.current.add(id);
        void onWidgetAction({
          type: "save",
          factId: id,
          factText: text.replace(/\s+/g, " ").trim(),
        });
        return { success: true };
      }

      return { success: false };
    },
    onResponseEnd: () => {
      onResponseEnd();
    },
    onResponseStart: () => {
      setErrorState({ integration: null, retryable: false });
    },
    onThreadChange: ({ threadId }: { threadId: string | null }) => {
      setActiveThreadId(threadId ?? null);
      processedFacts.current.clear();
    },
    onThreadLoadEnd: ({ threadId }: { threadId: string }) => {
      setActiveThreadId(threadId ?? null);
    },
    onError: ({ error }: { error: unknown }) => {
      // Note that Chatkit UI handles errors for your users.
      // Thus, your app code doesn't need to display errors on UI.
      console.error("ChatKit error", error);
    },
  });

  const activeError = errors.session ?? errors.integration;
  const blockingError = errors.script ?? activeError;

  if (isDev) {
    console.debug("[ChatKitPanel] render state", {
      isInitializingSession,
      hasControl: Boolean(chatkit.control),
      scriptStatus,
      hasError: Boolean(blockingError),
      workflowId: WORKFLOW_ID,
    });
  }

  const handleNewChat = useCallback(() => {
    void chatkit.setThreadId(null);
    // Close mobile history sidebar after creating new chat
    setShowHistoryOnMobile(false);
  }, [chatkit]);

  const handleSelectThread = useCallback(
    (id: string) => {
      // Optimistically highlight selection
      setActiveThreadId(id);
      void chatkit.setThreadId(id);
      // Close mobile history sidebar after selection
      setShowHistoryOnMobile(false);
    },
    [chatkit]
  );

  const handleDeletedThread = useCallback(
    (id: string) => {
      if (activeThreadId === id) {
        setActiveThreadId(null);
        void chatkit.setThreadId(null);
      }
      // Fetch updated data if needed
      void chatkit.fetchUpdates();
    },
    [activeThreadId, chatkit]
  );

  const handleRenamedThread = useCallback(
    (_id: string, _title: string) => {
      setTitleOverrides((prev) => ({ ...prev, [_id]: _title }));
      // Update header right away
      void chatkit.fetchUpdates();
    },
    [chatkit]
  );

  return (
    <div className="relative flex h-[95vh] w-full overflow-hidden bg-white shadow-sm transition-colors">
      {/* Mobile toggle button - only visible on mobile when NOT showing history */}
      {!showHistoryOnMobile && (
        <button
          type="button"
          onClick={() => setShowHistoryOnMobile(true)}
          className="absolute right-2 top-2 z-30 flex h-12 w-12 items-center justify-center rounded-xl transition-colors md:hidden"
          style={{ backgroundColor: 'var(--cpsgo-primary)' }}
          aria-label="Show history"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5 text-white"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </button>
      )}

      {/* Chat History Sidebar - full screen on mobile when toggled, sidebar on desktop */}
      <div className={`${showHistoryOnMobile ? 'absolute inset-0 z-40 flex md:relative md:inset-auto' : 'hidden md:flex'} h-full`}>
        <ChatHistorySidebar
          chatkitRef={chatkit.ref}
          activeThreadId={activeThreadId}
          onNewChat={handleNewChat}
          onSelectThread={handleSelectThread}
          titleOverrides={titleOverrides}
          getAccessToken={async () => {
            try {
              const audience = process.env.NEXT_PUBLIC_AUTH0_AUDIENCE;
              const token = await getAccessTokenSilently(
                audience ? { authorizationParams: { audience } } : undefined
              );
              return token ?? null;
            } catch (e) {
              console.error("[ChatKitPanel] getAccessToken failed", e);
              return null;
            }
          }}
          onDeletedThread={handleDeletedThread}
          onRenamedThread={handleRenamedThread}
          onCloseMobile={() => setShowHistoryOnMobile(false)}
        />
      </div>

      {/* Chat area - hidden on mobile when history is shown */}
      <div className={`relative flex-1 ${showHistoryOnMobile ? 'hidden md:flex' : 'flex'}`}>
        <ChatKit
          key={widgetInstanceKey}
          control={chatkit.control}
          className={"block h-[95%] w-full"}
        />
        <ErrorOverlay
          error={blockingError}
          fallbackMessage={null}
          onRetry={blockingError && errors.retryable ? handleResetChat : null}
          retryLabel="Restart chat"
        />
        
        {/* Footer with Disclaimer */}
        <footer className="cpsgo-footer absolute bottom-0 left-0 right-0 w-full border-t border-slate-200 bg-white py-3">
          <div className="mx-auto flex max-w-5xl items-center justify-center px-4">
            <p className="text-xs text-slate-600 text-center">
              CPSgo Chat is continuously learning - please verify important information.{' '}
              <button
                onClick={() => setShowDisclaimer(true)}
                className="hover:underline"
                style={{ color: 'var(--cpsgo-primary)' }}
              >
                View Disclaimer
              </button>
            </p>
          </div>
        </footer>
      </div>

      {/* Disclaimer Dialog */}
      <DisclaimerDialog
        isOpen={showDisclaimer}
        onClose={() => setShowDisclaimer(false)}
      />
    </div>
  );
}

function extractErrorDetail(
  payload: Record<string, unknown> | undefined,
  fallback: string
): string {
  if (!payload) {
    return fallback;
  }

  const error = payload.error;
  if (typeof error === "string") {
    return error;
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }

  const details = payload.details;
  if (typeof details === "string") {
    return details;
  }

  if (details && typeof details === "object" && "error" in details) {
    const nestedError = (details as { error?: unknown }).error;
    if (typeof nestedError === "string") {
      return nestedError;
    }
    if (
      nestedError &&
      typeof nestedError === "object" &&
      "message" in nestedError &&
      typeof (nestedError as { message?: unknown }).message === "string"
    ) {
      return (nestedError as { message: string }).message;
    }
  }

  if (typeof payload.message === "string") {
    return payload.message;
  }

  return fallback;
}
