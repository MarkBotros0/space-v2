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
