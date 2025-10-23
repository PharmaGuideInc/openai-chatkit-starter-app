"use client";

import { useCallback } from "react";
import { ChatKitPanel, type FactAction } from "@/components/ChatKitPanel";
import { useColorScheme } from "@/hooks/useColorScheme";
import { AuthButtons } from "@/components/AuthButtons";
import { useAuth0 } from "@auth0/auth0-react";

export default function App() {
  const { scheme, setScheme } = useColorScheme();
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();

  const handleWidgetAction = useCallback(async (action: FactAction) => {
    if (process.env.NODE_ENV !== "production") {
      console.info("[ChatKitPanel] widget action", action);
    }
  }, []);

  const handleResponseEnd = useCallback(() => {
    if (process.env.NODE_ENV !== "production") {
      console.debug("[ChatKitPanel] response end");
    }
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-end bg-slate-100 dark:bg-slate-950">
      {isAuthenticated && (
        <div className="mx-auto w-full max-w-5xl px-4 py-3 flex items-center justify-end">
          <AuthButtons />
        </div>
      )}
      <div className="mx-auto w-full max-w-5xl">
        {isLoading ? (
          <div className="flex items-center justify-center h-[60vh] text-slate-500 dark:text-slate-400">
            Checking session…
          </div>
        ) : isAuthenticated ? (
          <ChatKitPanel
            theme={scheme}
            onWidgetAction={handleWidgetAction}
            onResponseEnd={handleResponseEnd}
            onThemeRequest={setScheme}
          />
        ) : (
          <div className="flex items-center justify-center h-[60vh]">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center shadow-sm">
              <h2 className="text-lg font-semibold mb-2 text-slate-900 dark:text-slate-100">
                Sign in to start chatting
              </h2>
              <p className="text-sm mb-6 text-slate-600 dark:text-slate-400">
                Please log in with Auth0 to access the assistant.
              </p>
              <button
                onClick={() => loginWithRedirect()}
                className="px-4 py-2 rounded-md bg-slate-900 text-white text-sm dark:bg-slate-100 dark:text-slate-900 cursor-pointer"
              >
                Log in
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
