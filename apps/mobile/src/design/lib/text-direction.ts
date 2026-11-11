/**
 * Reading direction of quiz content (prompts, options, answers), which may be
 * Arabic, English or mixed while the app UI stays English. The first strong
 * character decides: Arabic/Hebrew ranges are rtl, a Latin letter is ltr;
 * digits (Western and Arabic-Indic), punctuation and spaces are skipped.
 */
const RTL_CHAR = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const DIGIT = /[0-9\u0660-\u0669\u06F0-\u06F9]/;
const LTR_CHAR = /[A-Za-zÀ-ɏ]/;

function textDirection(s: string): "rtl" | "ltr" {
  for (const ch of s) {
    if (DIGIT.test(ch)) continue;
    if (RTL_CHAR.test(ch)) return "rtl";
    if (LTR_CHAR.test(ch)) return "ltr";
  }
  return "ltr";
}

export { textDirection };
