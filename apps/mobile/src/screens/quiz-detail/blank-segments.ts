import { BLANK_TOKEN } from "@space/shared";

import { textDirection } from "../../design/lib/text-direction";

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

type Dir = "rtl" | "ltr";
type Run = { text: string; dir: Dir };

/** A word's own direction, or null when it has no letter (digits, punctuation). */
const wordDirection = (word: string): Dir | null => (/\p{L}/u.test(word) ? textDirection(word) : null);

/**
 * A text run of the sentence as the pieces that lay out in its flow, so an English name in an
 * Arabic sentence (or the other way round) keeps its own word order: consecutive words of the
 * other direction make one run, a word with no letter joins the run before it (or starts one in
 * the sentence's direction), and each word in the sentence's direction is its own run, so lines
 * still wrap between words.
 */
export function directionRuns(text: string, sentenceDir: Dir): Run[] {
  const runs: Run[] = [];
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const dir = wordDirection(word);
    const last = runs[runs.length - 1];
    if (last && (dir === null || (dir !== sentenceDir && last.dir === dir))) last.text += ` ${word}`;
    else runs.push({ text: word, dir: dir ?? sentenceDir });
  }
  return runs;
}
