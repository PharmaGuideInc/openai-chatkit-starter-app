"use client";

import { useCallback, useEffect, useState } from "react";
import { ChatKitPanel, type FactAction } from "@/components/ChatKitPanel";
import { AuthButtons } from "@/components/AuthButtons";
import { useAuth0 } from "@auth0/auth0-react";
import { TermsAgreementDialog } from "@/components/TermsAgreementDialog";

export default function App() {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();
  const [showTermsAgreement, setShowTermsAgreement] = useState(false);

  // Show terms agreement dialog on every login/app mount when authenticated
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      setShowTermsAgreement(true);
    }
  }, [isAuthenticated, isLoading]);

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
    <main className="flex flex-col items-center justify-end">
      {isAuthenticated && (
        <div className="cpsgo-header mx-auto w-full max-w-5xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-white">CPSgo Chat</h1>
            <span className="inline-block px-2 py-0.5 text-xs font-semibold rounded-md text-white" style={{ backgroundColor: '#E91E8C' }}>
              BETA
            </span>
          </div>
          <div className="flex items-center gap-3">
            <AuthButtons />
          </div>
        </div>
      )}
      <div className="mx-auto w-full">
        {isLoading ? (
          <div className="flex items-center justify-center h-[60vh] text-slate-500">
            Checking session…
          </div>
        ) : isAuthenticated ? (
          <ChatKitPanel
            onWidgetAction={handleWidgetAction}
            onResponseEnd={handleResponseEnd}
          />
        ) : (
          <div className="flex items-center justify-center h-[60vh]">
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
              <h2 className="text-lg font-semibold mb-2 text-slate-900">
                Sign in to start chatting
              </h2>
              <p className="text-sm mb-6 text-slate-600">
                Please log in with Auth0 to access the assistant.
              </p>
              <button
                onClick={() => loginWithRedirect()}
                className="cpsgo-btn-primary cursor-pointer"
              >
                Log in
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <TermsAgreementDialog
        isOpen={showTermsAgreement}
        onClose={() => setShowTermsAgreement(false)}
      />
    </main>
  );
}
