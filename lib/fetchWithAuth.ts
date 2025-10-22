export type GetToken = () => Promise<string>;

export async function fetchWithAuth(
  input: RequestInfo | URL,
  getToken: GetToken,
  init: RequestInit = {}
) {
  const token = await getToken();
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(input, { ...init, headers });
}

