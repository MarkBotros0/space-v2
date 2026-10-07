const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * Hosts whose URLs may name a YouTube video. v1 had no host check at all
 * (R33), so `https://example.com/embed/AAAAAAAAAAA` parsed successfully and its
 * "id" was handed to the YouTube IFrame player.
 */
const HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
  "youtu.be",
  "www.youtu.be",
]);

const PATH_PREFIXES = new Set(["embed", "shorts", "live", "v"]);

/**
 * Extract the 11-character video id, or null.
 *
 * Accepted: `watch?v=ID` on any allowed host (with any other query params, in
 * any order), `youtu.be/ID`, `/embed/ID`, `/shorts/ID`, `/live/ID`, `/v/ID`,
 * a host-relative URL with no scheme, and a bare 11-character id — which is
 * what an admin copying from the YouTube UI often has.
 *
 * `/live/` and `/v/` are additions (spec 13 §10 D7a): `/live/` is what a
 * premiere or a streamed session produces, and v1 returned null for it, which
 * meant the student page silently degraded to a plain link and the whole
 * authored quiz became unreachable with no message to anyone (R32, R37).
 *
 * Parsing the URL rather than regex-scanning the raw string is what closes both
 * of v1's holes at once: the host is checked (R33), and the id must be the
 * *whole* value rather than its first 11 characters, so a 12-character token
 * fails instead of yielding a valid-looking wrong id (R34).
 */
export function parseYouTubeId(raw: string): string | null {
  const input = raw.trim();
  if (input === "") return null;
  if (VIDEO_ID.test(input)) return input;

  let url: URL;
  try {
    url = new URL(input.includes("://") ? input : `https://${input}`);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  if (!HOSTS.has(host)) return null;

  const v = url.searchParams.get("v");
  if (v !== null) return VIDEO_ID.test(v) ? v : null;

  const segments = url.pathname.split("/").filter((s) => s !== "");
  if (host === "youtu.be" || host === "www.youtu.be") {
    const [id] = segments;
    return id !== undefined && VIDEO_ID.test(id) ? id : null;
  }

  const [prefix, id] = segments;
  if (prefix === undefined || id === undefined) return null;
  if (!PATH_PREFIXES.has(prefix)) return null;
  return VIDEO_ID.test(id) ? id : null;
}
