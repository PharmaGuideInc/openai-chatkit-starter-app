import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export const runtime = "edge";

function json(payload: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export async function GET(request: Request): Promise<Response> {
  try {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return json({ error: "Missing OPENAI_API_KEY environment variable" }, 500);
    }

    // Require Auth0 bearer token like create-session
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      return json({ error: "Missing Authorization header" }, 401);
    }
    const token = authHeader.slice(7).trim();
    const { userIdFromAuth } = await verifyAuth0Token(token);

    // Parse query params
    const url = new URL(request.url);
    const limitParam = url.searchParams.get("limit");
    const afterParam = url.searchParams.get("after");
    const orderParam = url.searchParams.get("order");

    const limit = limitParam ? Math.max(1, Math.min(100, Number(limitParam) || 20)) : 20;
    const order = orderParam === "asc" ? "asc" : "desc" as const;

    const apiBase = (process.env.CHATKIT_API_BASE || "https://api.openai.com").replace(/\/$/, "");
    const query = new URLSearchParams();
    query.set("user", userIdFromAuth);
    query.set("order", order);
    query.set("limit", String(limit));
    if (afterParam) query.set("after", afterParam);

    const upstreamURL = `${apiBase}/v1/chatkit/threads?${query.toString()}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    const upstreamResponse = await fetch(upstreamURL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "OpenAI-Beta": "chatkit_beta=v1",
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    const upstreamJson = (await upstreamResponse.json().catch(() => ({}))) as
      | {
          data?: Array<{ id: string; title?: string | null; created_at?: number; user?: string; status?: unknown }>;
          has_more?: boolean;
          last_id?: string | null;
        }
      | undefined;

    if (!upstreamResponse.ok) {
      const message = (upstreamJson as Record<string, unknown>)?.error || upstreamResponse.statusText;
      return json({ error: message, details: upstreamJson }, upstreamResponse.status);
    }

    const data = upstreamJson?.data ?? [];
    const threads = data.map((t) => {
      const threadStatus = t.status as { type?: unknown } | undefined;
      return {
        id: t.id,
        title: t.title ?? null,
        created_at: t.created_at ?? null,
        status:
          threadStatus && typeof threadStatus === "object" && typeof threadStatus.type === "string"
            ? threadStatus.type
            : "active",
        user: t.user ?? userIdFromAuth,
      };
    });

    return json({ threads, has_more: Boolean(upstreamJson?.has_more), last_id: upstreamJson?.last_id ?? null });
  } catch (error) {
    console.error("[threads] GET failed", error);
    const isAbort =
      error && typeof error === "object" && "name" in error &&
      (error.name === "AbortError" || error.name === "TimeoutError");
    if (isAbort) {
      return json({ error: "Upstream request timed out" }, 504);
    }
    return json({ error: "Unexpected error" }, 500);
  }
}

async function verifyAuth0Token(token: string): Promise<{ userIdFromAuth: string }> {
  const domain = process.env.AUTH0_DOMAIN || process.env.NEXT_PUBLIC_AUTH0_DOMAIN || "";
  const audience = process.env.AUTH0_AUDIENCE || process.env.NEXT_PUBLIC_AUTH0_AUDIENCE || "";

  if (!domain) throw new Error("Missing AUTH0_DOMAIN or NEXT_PUBLIC_AUTH0_DOMAIN env var");
  if (!audience) throw new Error("Missing AUTH0_AUDIENCE or NEXT_PUBLIC_AUTH0_AUDIENCE env var");

  const issuer = `https://${domain}/`;
  const JWKS = createRemoteJWKSet(new URL(`https://${domain}/.well-known/jwks.json`));

  const { payload } = await jwtVerify(token, JWKS, { issuer, audience });
  const sub = getSubject(payload);
  if (!sub) throw new Error("Invalid token: missing subject");
  return { userIdFromAuth: sub };
}

function getSubject(payload: JWTPayload): string | null {
  const sub = payload.sub;
  return typeof sub === "string" && sub.length > 0 ? sub : null;
}
