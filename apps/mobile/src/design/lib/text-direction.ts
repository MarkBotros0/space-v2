/**
 * Reading direction of quiz content (prompts, options, answers), which may be
 * Arabic, English or mixed while the app UI stays English. The first strong
 * character decides: Arabic/Hebrew ranges are rtl, a Latin letter is ltr;
 * digits (Western and Arabic-Indic), punctuation and spaces are skipped.
 */
const RTL_CHAR = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
const DIGIT = /[0-9\u0660-\u0669\u06F0-\u06F9]/;
const LTR_CHAR = /[A-Za-z\u00C0-\u024F]/;

function textDirection(s: string): "rtl" | "ltr" {
  for (const ch of s) {
    if (DIGIT.test(ch)) continue;
    if (RTL_CHAR.test(ch)) return "rtl";
    if (LTR_CHAR.test(ch)) return "ltr";
  }
  return "ltr";
}

/**
 * Style for a line of user-written text in a regular weight: right to left, right aligned and in the
 * Arabic face when it starts in Arabic; nothing otherwise, so English rows are untouched.
 */
function directionStyle(s: string) {
  if (textDirection(s) !== "rtl") return undefined;
  return { writingDirection: "rtl", textAlign: "right", fontFamily: "IBMPlexSansArabic_400Regular" } as const;
}

export { directionStyle, textDirection };
