import { test } from "node:test";
import assert from "node:assert/strict";
import { themeColorVars } from "../lib/theme-vars.mjs";

const css = `@import "tailwindcss";
@theme inline {
  /* Brand */
  --color-brand-navy-900: #1F3260;
  --color-role-super: var(--color-brand-navy-900);
  --font-sans: var(--font-geist-sans);
}
:root {
  --background: oklch(0.99 0.005 250);
  --color-not-theme: #000;
}`;

test("collects every --color-* declared in @theme blocks, values verbatim", () => {
  assert.deepEqual(themeColorVars(css), {
    "--color-brand-navy-900": "#1F3260",
    "--color-role-super": "var(--color-brand-navy-900)",
  });
});

test("ignores declarations outside @theme", () => {
  assert.equal(themeColorVars(css)["--color-not-theme"], undefined);
});
