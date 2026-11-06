import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import { meUserSchema, type MeUser, type UpdateProfileBody } from "@space/shared";

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";

/**
 * PATCH /me — any role, any non-empty subset of `name`, `phone`,
 * `dateOfBirth` ("YYYY-MM-DD") and `address`; absent keys are untouched, ""
 * or null clears the three contact fields. Folds the returned row back into
 * the session store — the server's row is the truth, not the optimistic
 * local edit (spec 18 R23).
 */
export function useUpdateProfile(): UseMutationResult<MeUser, Error, UpdateProfileBody> {
  return useMutation({
    mutationFn: async (body) => {
      const res = await apiClient.patch("/api/v1/me", body);
      return meUserSchema.parse(res.data.data.user);
    },
    onSuccess: (user) => {
      const scopes = useSessionStore.getState().scopes;
      if (scopes) useSessionStore.getState().setSession(user, scopes);
    },
  });
}
