"use client";

import { Auth0Provider } from "@auth0/auth0-react";
import React from "react";

type Props = {
  children: React.ReactNode;
};

export default function Auth0ProviderWithConfig({ children }: Props) {
  const domain = process.env.NEXT_PUBLIC_AUTH0_DOMAIN ?? "";
  const clientId = process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID ?? "";
  const audience = process.env.NEXT_PUBLIC_AUTH0_AUDIENCE ?? undefined;
  const redirectUri =
    process.env.NEXT_PUBLIC_AUTH0_REDIRECT_URI ||
    (typeof window !== "undefined" ? window.location.origin : undefined);

  // If configuration is missing, render the app without the provider
  if (!domain || !clientId) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[Auth0] Missing NEXT_PUBLIC_AUTH0_DOMAIN or NEXT_PUBLIC_AUTH0_CLIENT_ID; rendering without Auth0Provider"
      );
    }
    return <>{children}</>;
  }

  return (
    <Auth0Provider
      domain={domain}
      clientId={clientId}
      authorizationParams={{
        audience,
        redirect_uri: redirectUri,
        scope: "openid profile email offline_access",
      }}
      cacheLocation="localstorage"
      useRefreshTokens
      onRedirectCallback={(appState) => {
        try {
          const target = appState?.returnTo || window.location.pathname;
          window.history.replaceState({}, document.title, target);
        } catch {
          // no-op
        }
      }}
    >
      {children}
    </Auth0Provider>
  );
}
