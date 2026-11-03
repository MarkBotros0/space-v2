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
    .nullish()
    .transform((v) => (v === "" ? null : v));
