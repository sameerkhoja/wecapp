// Adapted from Luna's mobile API client: one authenticated JSON API for web and native.
import { Platform } from "react-native";
import { readSession, writeSession } from "./storage";
let token: string | null = null;
import { apiBase } from "./config";
export { apiBase };
export async function setToken(value: string | null) {
  token = value;
  await writeSession(value);
}
export async function loadToken() {
  token = await readSession();
  return token;
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
  key?: string,
): Promise<T> {
  if (
    Platform.OS !== "web" &&
    process.env.EXPO_PUBLIC_WECAPP_ENV === "production" &&
    !apiBase.startsWith("https://")
  )
    throw new Error("Set a secure Wecapp API URL for this production build.");
  let response: Response;
  try {
    response = await fetch(apiBase + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error(
      "Could not connect to Wecapp. Check your connection and API address.",
    );
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(data.error || `Request failed (${response.status})`);
  return data as T;
}
export async function exportCSV() {
  const r = await fetch(apiBase + "/api/admin/export", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error("Export failed");
  return r.text();
}
