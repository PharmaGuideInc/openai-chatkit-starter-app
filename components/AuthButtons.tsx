"use client";

import { useAuth0 } from "@auth0/auth0-react";

export function AuthButtons() {
  const { isAuthenticated, isLoading, user, logout } =
    useAuth0();

  if (isLoading) {
    return (
      <div className="text-sm text-slate-500">Loading…</div>
    );
  }

  // Do not show a login button here; the main page already provides
  // a sign-in CTA. When unauthenticated, render nothing in the header.
  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-slate-700">
        {user?.name || user?.email}
      </span>
      <button
        onClick={() =>
          logout({ logoutParams: { returnTo: window.location.origin } })
        }
        className="px-3 py-1 rounded-md border text-sm border-slate-300 cursor-pointer"
      >
        Log out
      </button>
    </div>
  );
}
