// Cuts a tall full-page screenshot into viewport-height slices so it can be
// viewed or compared piece by piece: node slice.mjs <in.png> <outPrefix> [sliceHeightPx]
import { readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";

const [input, prefix, h = "1624"] = process.argv.slice(2);
if (!input || !prefix) throw new Error("usage: slice.mjs <in.png> <outPrefix> [sliceHeightPx]");
const src = PNG.sync.read(readFileSync(input));
const sliceH = Number(h);
const count = Math.ceil(src.height / sliceH);
for (let i = 0; i < count; i++) {
  const height = Math.min(sliceH, src.height - i * sliceH);
  const out = new PNG({ width: src.width, height });
  PNG.bitblt(src, out, 0, i * sliceH, src.width, height, 0, 0);
  writeFileSync(`${prefix}-${String(i + 1).padStart(2, "0")}.png`, PNG.sync.write(out));
}
console.log(`${count} slices of ${src.width}x${sliceH} from ${input}`);
