/**
 * What a script may say about the database it talks to: the host, or whether it
 * is direct or pooled. Never the URL. A malformed URL answers "unknown": letting
 * `new URL` throw would print the input, credentials included.
 */
export function databaseHost(databaseUrl: string): string {
  try {
    return new URL(databaseUrl).hostname;
  } catch {
    return "unknown";
  }
}

/** Direct or pooled, never the host or URL. */
export function databaseHostType(databaseUrl: string): "direct" | "pooled" | "unknown" {
  const host = databaseHost(databaseUrl);
  if (host === "unknown") return "unknown";
  return /pooled|pooler/.test(host) ? "pooled" : "direct";
}
