"use client";

import { useAuth0 } from "@auth0/auth0-react";

export function AuthButtons() {
  const { isAuthenticated, isLoading, user, loginWithRedirect, logout } =
    useAuth0();

  if (isLoading) {
    return (
      <div className="text-sm text-slate-500 dark:text-slate-400">Loading…</div>
    );
  }

  if (!isAuthenticated) {
    return (
      <button
        onClick={() => loginWithRedirect()}
        className="px-3 py-1 rounded-md bg-slate-900 text-white text-sm dark:bg-slate-100 dark:text-slate-900"
      >
        Log in
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-slate-700 dark:text-slate-200">
        {user?.name || user?.email}
      </span>
      <button
        onClick={() =>
          logout({ logoutParams: { returnTo: window.location.origin } })
        }
        className="px-3 py-1 rounded-md border text-sm border-slate-300 dark:border-slate-700"
      >
        Log out
      </button>
    </div>
  );
}

