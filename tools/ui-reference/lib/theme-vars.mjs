/**
 * v1 declares its palette in `@theme inline { … }`, which Tailwind v4 inlines
 * into utilities without emitting CSS variables — so `var(--color-x)` only
 * resolves on a page whose CSS happens to define it. This reads the
 * declarations straight from globals.css so they can be injected before
 * resolving.
 */
export function themeColorVars(css) {
  const vars = {};
  for (const block of css.matchAll(/@theme[^{]*\{([\s\S]*?)\n\}/g)) {
    for (const m of block[1].matchAll(/(--color-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
      vars[m[1]] = m[2].trim();
    }
  }
  return vars;
}
