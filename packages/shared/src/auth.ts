import { z } from "zod";

export const userRoleSchema = z.enum(["SUPER", "ADMIN", "LEADER", "STUDENT", "MENTOR"]);
export type UserRole = z.infer<typeof userRoleSchema>;

export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

export const authUserSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  email: z.string().email(),
  role: userRoleSchema,
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const sessionSchema = z.object({
  accessToken: z.string().min(1),
  expiresIn: z.number().int().positive(),
  refreshToken: z.string().min(1),
});
export type Session = z.infer<typeof sessionSchema>;

export const loginResponseSchema = sessionSchema.extend({
  user: authUserSchema,
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const meScopesSchema = z.object({
  seasonAdminIds: z.array(z.number().int()),
  groupLeaderIds: z.array(z.number().int()),
  activeSeasonId: z.number().int().nullable(),
  /** Set when a student has graduated. Non-null means alumnus. */
  graduationYear: z.number().int().nullable(),
});
export type MeScopes = z.infer<typeof meScopesSchema>;

export const meUserSchema = authUserSchema.extend({
  avatarPath: z.string().nullable(),
});
export type MeUser = z.infer<typeof meUserSchema>;

export const meResponseSchema = z.object({
  // Null when the row was deleted inside the access token's 15-minute window.
  user: meUserSchema.nullable(),
  scopes: meScopesSchema,
});
export type MeResponse = z.infer<typeof meResponseSchema>;
