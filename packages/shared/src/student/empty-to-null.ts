import { z } from "zod";

/**
 * "" → null on optional free-text (v1 rule R26): a cleared field is stored
 * null, never "". `undefined` survives untouched so PATCH can distinguish
 * "clear this field" (null) from "leave it alone" (absent).
 *
 * Internal to the student domain — not re-exported from `@space/shared`.
 */
export const emptyToNull = (max: number) =>
  z
    .string()
    .max(max)
    .transform((v): string | null => (v === "" ? null : v))
    // nullish outside the transform: zod 4 keeps an object key optional only
    // when its outermost schema is optional, so the key stays optional in
    // the output type too (runtime is the same either way).
    .nullish();
