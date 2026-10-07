/**
 * Seconds as `m:ss`, or `h:mm:ss` past an hour.
 *
 * The finiteness guard is the fix for v1's R20: `Math.floor(NaN)` is `NaN` and
 * `Math.max(0, NaN)` is `NaN`, so the student-facing clock in
 * `interactive-video-player.tsx:290` rendered the string "NaN:NaN" whenever the
 * player failed to report a duration (v1 R81 — a common case on a phone).
 */
export function formatTimestamp(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds)) return "0:00";
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const pad = (n: number): string => String(n).padStart(2, "0");
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${minutes}:${pad(seconds)}`;
}

const COMPONENT = /^\d+$/;

/** The 24-hour ceiling the authoring schema enforces, kept in one place. */
export const MAX_VIDEO_SECONDS = 86_400;

/**
 * Parse `m:ss`, `h:mm:ss` or plain seconds. Null when the input is not a valid
 * timestamp.
 *
 * Rewritten rather than ported (spec 13 §10 D8). v1 converted each component
 * with `Number()`, which accepts the empty string as 0 (so ":" was 0s, "1:" was
 * 60s, ":30" was 30s — R23), accepts `0x10` and `1e3` (R24), and applied no
 * upper bound (R27), so the rejection surfaced a round trip later as the
 * action's generic "Please fix the highlighted fields." — with nothing
 * highlighted (R28).
 *
 * Kept from v1: a single component is plain seconds with no `< 60` rule
 * ("90" is 90 seconds, R26) and the `m:ss` / `h:mm:ss` output format, because
 * admin muscle memory depends on both.
 */
export function parseTimestamp(input: string, maxSeconds = MAX_VIDEO_SECONDS): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;

  const parts = trimmed.split(":");
  if (parts.length > 3) return null;
  if (!parts.every((p) => COMPONENT.test(p))) return null;

  const nums = parts.map((p) => Number(p));
  let total: number;
  if (nums.length === 1) {
    total = nums[0] as number;
  } else if (nums.length === 2) {
    if ((nums[1] as number) >= 60) return null;
    total = (nums[0] as number) * 60 + (nums[1] as number);
  } else {
    if ((nums[1] as number) >= 60 || (nums[2] as number) >= 60) return null;
    total = (nums[0] as number) * 3600 + (nums[1] as number) * 60 + (nums[2] as number);
  }

  return total > maxSeconds ? null : total;
}
