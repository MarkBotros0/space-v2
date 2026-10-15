// One PNG with v1 (left) and v2 (right, several shots stacked) scaled to the
// same CSS width, for a quick visual check. Real data: write outside the repo.
// node side-by-side.mjs <out.png> <v1.png> <v2.png[,v2b.png…]> [width=375] [maxHeight=2400]
import { readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";

const [out, v1Path, v2List, w = "375", maxH = "2400"] = process.argv.slice(2);
const W = Number(w);
const scale = (png) => {
  const f = png.width / W;
  const h = Math.round(png.height / f);
  const dst = new PNG({ width: W, height: h });
  for (let y = 0; y < h; y++)
    for (let x = 0; x < W; x++) {
      const si = ((Math.floor(y * f) * png.width + Math.floor(x * f)) << 2) >>> 0;
      const di = (y * W + x) << 2;
      png.data.copy(dst.data, di, si, si + 4);
    }
  return dst;
};
const left = scale(PNG.sync.read(readFileSync(v1Path)));
const rights = v2List.split(",").map((p) => scale(PNG.sync.read(readFileSync(p))));
const rightH = rights.reduce((a, r) => a + r.height, 0);
const H = Math.min(Number(maxH), Math.max(left.height, rightH));
const gap = 12;
const img = new PNG({ width: W * 2 + gap, height: H });
img.data.fill(0x99);
const blit = (src, ox, oy) => {
  for (let y = 0; y < src.height && oy + y < H; y++)
    src.data.copy(img.data, ((oy + y) * img.width + ox) << 2, (y * src.width) << 2, ((y + 1) * src.width) << 2);
};
blit(left, 0, 0);
let oy = 0;
for (const r of rights) {
  blit(r, W + gap, oy);
  oy += r.height;
}
writeFileSync(out, PNG.sync.write(img));
console.log(out, `${img.width}x${img.height}`);
