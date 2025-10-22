import Script from "next/script";
import type { Metadata } from "next";
import "./globals.css";
import Auth0ProviderWithConfig from "./auth/Auth0ProviderWithConfig";

export const metadata: Metadata = {
  title: "AgentKit demo",
  description: "Demo of ChatKit with hosted workflow",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <Script
          src="https://cdn.platform.openai.com/deployments/chatkit/chatkit.js"
          strategy="beforeInteractive"
        />
      </head>
      <body className="antialiased">
        <Auth0ProviderWithConfig>{children}</Auth0ProviderWithConfig>
      </body>
    </html>
  );
}
