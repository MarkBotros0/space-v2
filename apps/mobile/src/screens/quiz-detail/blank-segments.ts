import { BLANK_TOKEN } from "@space/shared";

type Segment = { kind: "text"; text: string } | { kind: "blank"; index: number };

/** A fill-in-the-blank prompt as text runs and gaps; gaps are numbered from 0 in reading order. */
export function splitBlanks(prompt: string): Segment[] {
  const out: Segment[] = [];
  prompt.split(BLANK_TOKEN).forEach((text, i) => {
    if (i > 0) out.push({ kind: "blank", index: i - 1 });
    if (text !== "") out.push({ kind: "text", text });
  });
  return out;
}

/** Gaps sit inline in the sentence unless the phone is under 360dp wide or the font is scaled past 1.15. */
export function blanksInline({ width, fontScale }: { width: number; fontScale: number }): boolean {
  return width >= 360 && fontScale <= 1.15;
}
