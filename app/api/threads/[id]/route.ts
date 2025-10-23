import { createRemoteJWKSet, jwtVerify } from "jose";

export const runtime = "edge";

function json(payload: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

async function getParamId(params: unknown): Promise<string | null> {
  try {
    const resolved: { id?: string } = await (params as Promise<{ id?: string }>);
    return typeof resolved?.id === "string" ? resolved.id : null;
  } catch {
    return null;
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) return json({ error: "Missing OPENAI_API_KEY" }, 500);

    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      return json({ error: "Missing Authorization header" }, 401);
    }
    const token = authHeader.slice(7).trim();
    await verifyAuth0Token(token);

    const threadId = await getParamId(params);
    if (!threadId) return json({ error: "Missing thread id" }, 400);

    const apiBase = (process.env.CHATKIT_API_BASE || "https://api.openai.com").replace(/\/$/, "");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    const upstream = await fetch(`${apiBase}/v1/chatkit/threads/${threadId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "OpenAI-Beta": "chatkit_beta=v1",
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    const body = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return json({ error: body?.error || upstream.statusText, details: body }, upstream.status);
    }
    return json(body, 200);
  } catch (error) {
    console.error("[threads/:id] DELETE failed", error);
    return json({ error: "Unexpected error" }, 500);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) return json({ error: "Missing OPENAI_API_KEY" }, 500);

    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      return json({ error: "Missing Authorization header" }, 401);
    }
    const token = authHeader.slice(7).trim();
    await verifyAuth0Token(token);

    const threadId = await getParamId(params);
    if (!threadId) return json({ error: "Missing thread id" }, 400);

    const payload = await request.json().catch(() => null);
    const title = (payload && typeof payload.title === "string" ? payload.title : "").trim();
    if (!title) return json({ error: "Missing title" }, 400);

    const apiBase = (process.env.CHATKIT_API_BASE || "https://api.openai.com").replace(/\/$/, "");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    const upstream = await fetch(`${apiBase}/v1/chatkit/threads/${threadId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "OpenAI-Beta": "chatkit_beta=v1",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const body = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return json({ error: body?.error || upstream.statusText, details: body }, upstream.status);
    }
    return json(body, 200);
  } catch (error) {
    console.error("[threads/:id] PATCH failed", error);
    return json({ error: "Unexpected error" }, 500);
  }
}

async function verifyAuth0Token(token: string): Promise<void> {
  const domain = process.env.AUTH0_DOMAIN || process.env.NEXT_PUBLIC_AUTH0_DOMAIN || "";
  const audience = process.env.AUTH0_AUDIENCE || process.env.NEXT_PUBLIC_AUTH0_AUDIENCE || "";
  if (!domain || !audience) throw new Error("Missing Auth0 configuration");
  const issuer = `https://${domain}/`;
  const JWKS = createRemoteJWKSet(new URL(`https://${domain}/.well-known/jwks.json`));
  await jwtVerify(token, JWKS, { issuer, audience });
}
