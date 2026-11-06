import { z } from "zod";
import { authUserSchema, userRoleSchema, type UserRole } from "./auth";
import { addressFieldSchema, dateOfBirthFieldSchema, phoneFieldSchema } from "./contact-fields";

/**
 * Roles only an alumnus (non-null graduationYear) may hold — v1's
 * src/lib/roles.ts, ported into the shared contract so the schema refinement
 * and the screens consume one list (spec 11 R2).
 */
export const ALUMNI_ONLY_ROLES: readonly UserRole[] = ["LEADER", "ADMIN", "MENTOR"];

export function roleRequiresAlumnus(role: UserRole): boolean {
  return ALUMNI_ONLY_ROLES.includes(role);
}

/**
 * THE password policy — replacing v1's four unshared copies of "min 8"
 * (spec 11 R65). Max is 72 BYTES, not characters: bcrypt silently truncates
 * beyond 72 bytes, and accepting a longer passphrase is a promise the hash
 * does not keep (D8).
 */
export const passwordSchema = z
  .string()
  .min(8, "At least 8 characters.")
  .refine((p) => new TextEncoder().encode(p).length <= 72, {
    message: "At most 72 bytes.",
  });

/** The four badge states of spec 11 R82, derived server-side once (R81). */
export const userStatusSchema = z.enum(["active", "invited", "pending", "inactive"]);
export type UserStatus = z.infer<typeof userStatusSchema>;

export const userListItemSchema = authUserSchema.extend({
  graduationYear: z.number().int().nullable(),
  lastLoginAt: z.string().nullable(),
  deletedAt: z.string().nullable(),
  status: userStatusSchema,
});
export type UserListItem = z.infer<typeof userListItemSchema>;

export const userListResponseSchema = z.object({
  users: z.array(userListItemSchema),
  nextCursor: z.number().int().nullable(),
  total: z.number().int(),
});
export type UserListResponse = z.infer<typeof userListResponseSchema>;

/** Invite metadata. No `token` field, ever (R23, R75). */
export const inviteStateSchema = z.object({
  issuedAt: z.string(),
  expiresAt: z.string(),
  usedAt: z.string().nullable(),
  invitedByName: z.string().nullable(),
});
export type InviteState = z.infer<typeof inviteStateSchema>;

/** A season the user is a SeasonAdmin of (detail screen only). */
export const userAdminSeasonSchema = z.object({
  id: z.number().int(),
  code: z.string(),
  title: z.string(),
});
export type UserAdminSeason = z.infer<typeof userAdminSeasonSchema>;

export const userDetailSchema = userListItemSchema.extend({
  invite: inviteStateSchema.nullable(),
  /**
   * The (non-deleted) seasons this user administers. A role change away from
   * ADMIN deletes these rows, and only a SUPER re-adding them one season at a
   * time (season detail → Admins) restores them, so the edit screen names
   * them in its confirmation first.
   */
  adminSeasons: z.array(userAdminSeasonSchema),
});
export type UserDetail = z.infer<typeof userDetailSchema>;

/**
 * Year bounds live in a superRefine so "this year" is evaluated per call —
 * v1 captured CURRENT_YEAR at module load and refused January graduates until
 * the server restarted (R37).
 */
function checkUserFields(
  v: { role: UserRole; graduationYear: number | null },
  ctx: z.RefinementCtx,
): void {
  if (v.graduationYear !== null) {
    const currentYear = new Date().getFullYear();
    if (v.graduationYear < 1990 || v.graduationYear > currentYear) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["graduationYear"],
        message: `Must be between 1990 and ${currentYear}.`,
      });
    }
  }
  if (roleRequiresAlumnus(v.role) && v.graduationYear === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["graduationYear"],
      message: "Required for this role.",
    });
  }
}

export const createUserRequestSchema = z
  .object({
    name: z.string().trim().min(2, "At least 2 characters.").max(120, "At most 120 characters."),
    // Trimmed and lower-cased, as the importer normalises (normaliseEmail):
    // "Foo@x.com" and "foo@x.com" are one person, never two accounts.
    email: z.string().trim().toLowerCase().email("Must be a valid email."),
    role: userRoleSchema,
    graduationYear: z.number().int().nullable().default(null),
    /**
     * Must be `true` when `role` is SUPER (Plan 10 Decision 13 — spec 11 D7
     * rec 3 applied to creation as Plan 9 applied it to PATCH). The route
     * enforces it; the schema only types it.
     */
    confirmSuper: z.boolean().optional(),
  })
  .superRefine(checkUserFields);
export type CreateUserBody = z.output<typeof createUserRequestSchema>;

/**
 * Full replace of the three editable fields (v1's form always submits all
 * three — user-actions.ts:103-130). `email` is deliberately absent (R48) and
 * `.strict()` refuses it rather than stripping it. `confirmSuper` must be
 * `true` for a role change TO SUPER — spec 11 D7 rec 3: a SUPER grant cannot
 * be a mis-tapped picker item.
 */
export const updateUserRequestSchema = z
  .object({
    name: z.string().trim().min(2, "At least 2 characters.").max(120, "At most 120 characters."),
    role: userRoleSchema,
    graduationYear: z.number().int().nullable(),
    confirmSuper: z.boolean().optional(),
  })
  .strict()
  .superRefine(checkUserFields);
export type UpdateUserBody = z.output<typeof updateUserRequestSchema>;

export const acceptInviteRequestSchema = z.object({
  token: z.string().min(16).max(128),
  password: passwordSchema,
});
export type AcceptInviteBody = z.infer<typeof acceptInviteRequestSchema>;

export const acceptInviteResponseSchema = z.object({ ok: z.literal(true) });
export type AcceptInviteResponse = z.infer<typeof acceptInviteResponseSchema>;

/** POST /users/:id/deactivate and /reactivate both answer with this. */
export const activationResponseSchema = z.object({ deletedAt: z.string().nullable() });
export type ActivationResponse = z.infer<typeof activationResponseSchema>;

/**
 * PATCH /me — any role, any subset of the four keys, at least one.
 * Absent = untouched; for phone/dateOfBirth/address "" or null clears
 * (name cannot be cleared). strict(): the v1 property "no settings action
 * accepts a subject id" is preserved by construction — a body carrying
 * `userId` is a 400, not an ignored field (spec 18 §4).
 */
export const updateProfileRequestSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "At least 2 characters.")
      .max(120, "At most 120 characters.")
      .optional(),
    phone: phoneFieldSchema,
    dateOfBirth: dateOfBirthFieldSchema,
    address: addressFieldSchema,
  })
  .strict()
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "Nothing to update.",
  });
export type UpdateProfileBody = z.input<typeof updateProfileRequestSchema>;

/**
 * No `confirm` field — the typo guard is a client-side form rule (spec 18 §7).
 * `refreshToken` (optional) is the caller's own refresh token, excluded from
 * the revocation sweep so changing your password doesn't sign out the device
 * you changed it on; omitted, every session is revoked (fail-safe).
 */
export const changePasswordRequestSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password required."),
    newPassword: passwordSchema,
    refreshToken: z.string().min(1).optional(),
  })
  .strict();
export type ChangePasswordBody = z.infer<typeof changePasswordRequestSchema>;

export const changePasswordResponseSchema = z.object({
  ok: z.literal(true),
  sessionsRevoked: z.number().int().nonnegative(),
});
export type ChangePasswordResponse = z.infer<typeof changePasswordResponseSchema>;

export const logoutAllResponseSchema = z.object({
  revoked: z.number().int().nonnegative(),
});
export type LogoutAllResponse = z.infer<typeof logoutAllResponseSchema>;
/**
 * POST /users — Plan 9's response, given a schema so `/users/new` parses it.
 * `inviteSent` is false when the account was created but its invite email
 * could not be delivered (no mail transport, or the send failed): the
 * account stays "pending", ready for Send invite once mail works.
 */
export const createUserResponseSchema = z.object({
  userId: z.number().int(),
  inviteSent: z.boolean(),
});
export type CreateUserResponse = z.infer<typeof createUserResponseSchema>;

/**
 * Bulk "send all pending invites" (Plan 10 Decision 12): at most this many
 * users per request. Exported so the confirm dialog quotes the same number
 * the server enforces.
 */
export const BULK_INVITE_BATCH_SIZE = 20;

/** GET /users/invites/pending — how many accounts the bulk button would reach. */
export const pendingInvitesResponseSchema = z.object({
  pending: z.number().int().nonnegative(),
});
export type PendingInvitesResponse = z.infer<typeof pendingInvitesResponseSchema>;

/**
 * POST /users/invites/pending. `skipped` is spec 11 R16's missing third
 * counter (a user who stopped being eligible between listing and locking);
 * `remaining` is what is still pending after this batch.
 */
export const bulkInviteResponseSchema = z.object({
  sent: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
});
export type BulkInviteResponse = z.infer<typeof bulkInviteResponseSchema>;
