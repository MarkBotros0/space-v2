import { useMutation, useQuery, type UseMutationResult } from "@tanstack/react-query";
import axios from "axios";
import { devUsersResponseSchema, loginResponseSchema, meResponseSchema, type DevSwitchUser } from "@space/shared";

import { apiClient } from "../lib/api-client";
import { syncPushRegistration } from "../lib/push";
import { queryKeys } from "../lib/query-keys";
import { saveSession } from "../lib/token-storage";
import { useSessionStore } from "../store/session";

/**
 * Dev user switcher (v1 parity). The backend answers 404 on /dev/* unless it
 * runs with DEV_USER_SWITCHER=1, so `enabled` is false on any other backend
 * and the switcher never renders. One unretried probe: a 404 is the answer.
 */
export function useDevUsers(q: string, probeOnly = false) {
  return useQuery({
    queryKey: queryKeys.dev.users(probeOnly ? "" : q),
    queryFn: async (): Promise<DevSwitchUser[] | null> => {
      try {
        const res = await apiClient.get("/api/v1/dev/users", { params: q ? { q } : undefined });
        return devUsersResponseSchema.parse(res.data.data).users;
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 404) return null;
        throw err;
      }
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

/** Signs in as the chosen user: tokens saved, then /me fills the store the
 *  way useLogin does. The cache clears itself on the user change
 *  (clearCacheOnUserChange). */
export function useDevSwitch(): UseMutationResult<void, Error, number> {
  return useMutation({
    mutationFn: async (userId) => {
      const res = await apiClient.post("/api/v1/dev/switch", { userId });
      await saveSession(loginResponseSchema.parse(res.data.data));
      const me = meResponseSchema.parse((await apiClient.get("/api/v1/me")).data.data);
      if (!me.user) throw new Error("me returned no user after the switch");
      useSessionStore.getState().setSession(me.user, me.scopes);
      void syncPushRegistration();
    },
  });
}
