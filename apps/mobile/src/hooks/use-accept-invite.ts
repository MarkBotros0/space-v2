import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import {
  acceptInviteResponseSchema,
  type AcceptInviteBody,
  type AcceptInviteResponse,
} from "@space/shared";

import { apiClient } from "../lib/api-client";

/**
 * POST /auth/accept-invite. Lives in src/hooks/ and parses the response with
 * the shared schema like every other call (CLAUDE.md "Data fetching"; ruling
 * X10) — an earlier draft posted inline from the screen and ignored the body.
 */
export function useAcceptInvite(): UseMutationResult<AcceptInviteResponse, Error, AcceptInviteBody> {
  return useMutation({
    mutationFn: async (body) => {
      const res = await apiClient.post("/api/v1/auth/accept-invite", body);
      return acceptInviteResponseSchema.parse(res.data.data);
    },
  });
}
