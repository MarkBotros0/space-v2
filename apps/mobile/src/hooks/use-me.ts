import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import {
  changePasswordResponseSchema,
  logoutAllResponseSchema,
  meUserSchema,
  type ChangePasswordResponse,
  type LogoutAllResponse,
  type MeUser,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { loadRefreshToken } from "../lib/token-storage";
import { useSessionStore } from "../store/session";

/** PATCH /me and fold the returned row back into the session store — the
 *  server's row is the truth, not the optimistic local edit (spec 18 R23). */
export function useUpdateProfile(): UseMutationResult<MeUser, Error, { name: string }> {
  return useMutation({
    mutationFn: async ({ name }) => {
      const res = await apiClient.patch("/api/v1/me", { name });
      return meUserSchema.parse(res.data.data.user);
    },
    onSuccess: (user) => {
      const scopes = useSessionStore.getState().scopes;
      if (scopes) useSessionStore.getState().setSession(user, scopes);
    },
  });
}

/**
 * POST /me/password. The stored refresh token rides along so the server can
 * revoke every session EXCEPT this device's (Decision 11); if none is stored
 * the server revokes all, which is the safe direction to fail.
 */
export function useChangePassword(): UseMutationResult<
  ChangePasswordResponse,
  Error,
  { currentPassword: string; newPassword: string }
> {
  return useMutation({
    mutationFn: async (body) => {
      const refreshToken = await loadRefreshToken();
      const res = await apiClient.post("/api/v1/me/password", {
        ...body,
        ...(refreshToken ? { refreshToken } : {}),
      });
      return changePasswordResponseSchema.parse(res.data.data);
    },
  });
}

/** POST /auth/logout-all — revokes this device too; the caller must clear
 *  local state and navigate, same as useLogout's contract. */
export function useLogoutAll(): UseMutationResult<LogoutAllResponse, Error, void> {
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.post("/api/v1/auth/logout-all");
      return logoutAllResponseSchema.parse(res.data.data);
    },
  });
}
