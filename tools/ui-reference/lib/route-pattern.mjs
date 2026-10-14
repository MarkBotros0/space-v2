const PUBLIC_ID = /^[A-Za-z0-9_-]{10}$/;
const CODE_PARENTS = new Set(["seasons", "season"]);
const NEVER_FOLLOW = [/^\/api\//, /^\/uploads\//, /\/logout$/, /\/signout$/, /\/delete(\/|$)/];

export function toPattern(pathname) {
  const clean = pathname.split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";
  if (clean === "/") return "/";
  const parts = clean.split("/").slice(1);
  return (
    "/" +
    parts
      .map((seg, i) => {
        if (/^\d+$/.test(seg)) return "[id]";
        if (i > 0 && CODE_PARENTS.has(parts[i - 1])) return "[code]";
        if (PUBLIC_ID.test(seg) && /\d/.test(seg)) return "[publicId]";
        return seg;
      })
      .join("/")
  );
}

export function isCrawlable(href, baseUrl) {
  if (!href || href.startsWith("#") || /^(mailto|tel|javascript):/.test(href)) return false;
  let url;
  try {
    url = new URL(href, baseUrl);
  } catch {
    return false;
  }
  if (url.origin !== new URL(baseUrl).origin) return false;
  return !NEVER_FOLLOW.some((re) => re.test(url.pathname));
}

export function slugFor(pattern) {
  if (pattern === "/") return "root";
  return pattern.slice(1).replace(/[[\]]/g, "").split("/").join("__");
}
