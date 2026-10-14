const PUBLIC_ID = /^[A-Za-z0-9_-]{10}$/;
const CODE_PARENTS = new Set(["seasons", "season"]);
// v1 static pages under seasons/: super/seasons/{new,year/[year],program/[program]}.
const SEASON_STATIC = new Set(["new", "year", "program"]);
const NAMED_PARAMS = { year: "[year]", program: "[program]" };
const TOKEN_PARENTS = new Set(["checkin"]);
const NEVER_FOLLOW = [/^\/api\//, /^\/uploads\//, /\/logout$/, /\/signout$/, /\/delete(\/|$)/];

export function toPattern(pathname) {
  const clean = pathname.split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";
  if (clean === "/") return "/";
  const parts = clean.split("/").slice(1);
  return (
    "/" +
    parts
      .map((seg, i) => {
        const parent = parts[i - 1];
        if (i > 0 && CODE_PARENTS.has(parent)) return SEASON_STATIC.has(seg) ? seg : "[code]";
        if (i > 1 && CODE_PARENTS.has(parts[i - 2]) && NAMED_PARAMS[parent]) return NAMED_PARAMS[parent];
        if (i > 0 && TOKEN_PARENTS.has(parent)) return "[token]";
        if (/^\d+$/.test(seg)) return "[id]";
        if (PUBLIC_ID.test(seg) && (/\d/.test(seg) || (/[a-z]/.test(seg) && /[A-Z]/.test(seg)))) return "[publicId]";
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
