// Builds a self-contained HTML page with v1 and v2 screenshots side by side.
// v2 may be several viewport shots (comma-separated) stacked under each other,
// since Maestro captures one screen at a time and v1's capture is full-page.
// Images are embedded as data URIs so the file can be sent as one attachment.
// Output contains real data: write it under ~/projects/JPC/.v2-captures only.
// node compare.mjs --out <file.html> --pair <label> <v1.png> <v2.png[,v2b.png…]> [--pair …]
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
if (outIdx < 0) throw new Error("usage: compare.mjs --out <file.html> --pair <label> <v1.png> <v2.png[,…]> […]");
const out = args[outIdx + 1];
const pairs = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--pair") pairs.push({ label: args[i + 1], v1: args[i + 2], v2: args[i + 3].split(",") });
}
const img = (p) => `<img src="data:image/png;base64,${readFileSync(p).toString("base64")}">`;
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const rows = pairs
  .map(
    (p) =>
      `<section><h2>${esc(p.label)}</h2><div class="pair"><figure><figcaption>v1</figcaption>${img(p.v1)}</figure>` +
      `<figure><figcaption>v2</figcaption>${p.v2.map(img).join("")}</figure></div></section>`,
  )
  .join("\n");
writeFileSync(
  out,
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>v1 vs v2</title>
<style>body{font-family:system-ui;margin:16px;background:#f4f4f6}section{margin-bottom:32px}
.pair{display:flex;gap:16px;align-items:flex-start}figure{margin:0;display:flex;flex-direction:column}
img{width:375px;border:1px solid #ccc;display:block}</style>
${rows}`,
);
console.log(`wrote ${out} (${pairs.length} pairs)`);
