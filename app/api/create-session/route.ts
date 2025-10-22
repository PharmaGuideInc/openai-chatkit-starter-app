import { WORKFLOW_ID } from "@/lib/config";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export const runtime = "edge";

interface CreateSessionRequestBody {
  workflow?: { id?: string | null } | null;
  scope?: { user_id?: string | null } | null;
  workflowId?: string | null;
  chatkit_configuration?: {
    file_upload?: {
      enabled?: boolean;
    };
  };
}

const DEFAULT_CHATKIT_BASE = "https://api.openai.com";
// Auth now enforced; session cookie no longer used

export async function POST(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowedResponse();
  }
  let sessionCookie: string | null = null;
  try {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({
          error: "Missing OPENAI_API_KEY environment variable",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Enforce Auth0 authentication via Bearer token
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      return buildJsonResponse(
        { error: "Missing Authorization header" },
        401,
        { "Content-Type": "application/json" },
        null
      );
    }

    const token = authHeader.slice(7).trim();
    let userIdFromAuth: string;
    try {
      ({ userIdFromAuth } = await verifyAuth0Token(token));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Invalid or expired token";
      return buildJsonResponse(
        { error: message },
        401,
        { "Content-Type": "application/json" },
        null
      );
    }

    const parsedBody = await safeParseJson<CreateSessionRequestBody>(request);
    // We use the authenticated subject as the user id
    const userId = userIdFromAuth;
    sessionCookie = null;
    const resolvedWorkflowId =
      parsedBody?.workflow?.id ?? parsedBody?.workflowId ?? WORKFLOW_ID;

    if (process.env.NODE_ENV !== "production") {
      console.info("[create-session] handling request", {
        resolvedWorkflowId,
        body: JSON.stringify(parsedBody),
      });
    }

    if (!resolvedWorkflowId) {
      return buildJsonResponse(
        { error: "Missing workflow id" },
        400,
        { "Content-Type": "application/json" },
        sessionCookie
      );
    }

    const apiBase = process.env.CHATKIT_API_BASE ?? DEFAULT_CHATKIT_BASE;
    const url = `${apiBase}/v1/chatkit/sessions`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    const upstreamResponse = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`,
        "OpenAI-Beta": "chatkit_beta=v1",
      },
      signal: controller.signal,
      body: JSON.stringify({
        workflow: { id: resolvedWorkflowId },
        user: userId,
        chatkit_configuration: {
          file_upload: {
            enabled:
              parsedBody?.chatkit_configuration?.file_upload?.enabled ?? false,
          },
        },
      }),
    });
    clearTimeout(timer);

    if (process.env.NODE_ENV !== "production") {
      console.info("[create-session] upstream response", {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
      });
    }

    const upstreamJson = (await upstreamResponse.json().catch(() => ({}))) as
      | Record<string, unknown>
      | undefined;

    if (!upstreamResponse.ok) {
      const upstreamError = extractUpstreamError(upstreamJson);
      console.error("OpenAI ChatKit session creation failed", {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        body: upstreamJson,
      });
      return buildJsonResponse(
        {
          error:
            upstreamError ??
            `Failed to create session: ${upstreamResponse.statusText}`,
          details: upstreamJson,
        },
        upstreamResponse.status,
        { "Content-Type": "application/json" },
        sessionCookie
      );
    }

    // Normalize client_secret to a plain string for the client
    let clientSecret: string | null = null;
    const rawSecret = (upstreamJson as any)?.client_secret;
    if (typeof rawSecret === "string") {
      clientSecret = rawSecret;
    } else if (rawSecret && typeof rawSecret === "object") {
      clientSecret = (rawSecret as { value?: unknown }).value as string | null;
    }
    const expiresAfter =
      (upstreamJson as any)?.expires_after ??
      (rawSecret && typeof rawSecret === "object"
        ? (rawSecret as { expires_after?: unknown }).expires_after
        : null);
    const responsePayload = {
      client_secret: clientSecret,
      expires_after: expiresAfter,
    };

    return buildJsonResponse(responsePayload, 200, { "Content-Type": "application/json" }, sessionCookie);
  } catch (error) {
    console.error("Create session error", error);
    const isAbort =
      (error && typeof error === "object" && "name" in error &&
        // @ts-expect-error runtime check
        error.name === "AbortError") ||
      // Some environments set code instead of name
      (error && typeof error === "object" && "code" in error &&
        // @ts-expect-error runtime check
        error.code === 20);
    if (isAbort) {
      return buildJsonResponse(
        { error: "Upstream request timed out" },
        504,
        { "Content-Type": "application/json" },
        sessionCookie
      );
    }
    return buildJsonResponse(
      { error: "Unexpected error" },
      500,
      { "Content-Type": "application/json" },
      sessionCookie
    );
  }
}

export async function GET(): Promise<Response> {
  return methodNotAllowedResponse();
}

function methodNotAllowedResponse(): Response {
  return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
    status: 405,
    headers: { "Content-Type": "application/json" },
  });
}

// Verifies the Auth0 JWT access token and returns the subject (user id)
async function verifyAuth0Token(token: string): Promise<{ userIdFromAuth: string }>
{
  const domain =
    process.env.AUTH0_DOMAIN || process.env.NEXT_PUBLIC_AUTH0_DOMAIN || "";
  const audience =
    process.env.AUTH0_AUDIENCE || process.env.NEXT_PUBLIC_AUTH0_AUDIENCE || "";

  if (!domain) {
    throw new Error("Missing AUTH0_DOMAIN or NEXT_PUBLIC_AUTH0_DOMAIN env var");
  }
  if (!audience) {
    throw new Error(
      "Missing AUTH0_AUDIENCE or NEXT_PUBLIC_AUTH0_AUDIENCE env var"
    );
  }

  const issuer = `https://${domain}/`;
  const JWKS = createRemoteJWKSet(
    new URL(`https://${domain}/.well-known/jwks.json`)
  );

  const { payload } = await jwtVerify(token, JWKS, {
    issuer,
    audience,
  });

  const sub = getSubject(payload);
  if (!sub) {
    throw new Error("Invalid token: missing subject");
  }
  return { userIdFromAuth: sub };
}

function buildJsonResponse(
  payload: unknown,
  status: number,
  headers: Record<string, string>,
  sessionCookie: string | null
): Response {
  const responseHeaders = new Headers(headers);

  if (sessionCookie) {
    responseHeaders.append("Set-Cookie", sessionCookie);
  }

  return new Response(JSON.stringify(payload), {
    status,
    headers: responseHeaders,
  });
}

async function safeParseJson<T>(req: Request): Promise<T | null> {
  try {
    const text = await req.text();
    if (!text) {
      return null;
    }
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function extractUpstreamError(
  payload: Record<string, unknown> | undefined
): string | null {
  if (!payload) {
    return null;
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
  return null;
}

function getSubject(payload: JWTPayload): string | null {
  const sub = payload.sub;
  return typeof sub === "string" && sub.length > 0 ? sub : null;
}
