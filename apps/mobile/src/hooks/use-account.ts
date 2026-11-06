import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import { deleteAccountResponseSchema, type DeleteAccountResponse } from "@space/shared";

import { apiClient } from "../lib/api-client";

/** DELETE /me — the account holder deletes their own account. The server
 *  ends every session and drops this account's push devices; the caller
 *  clears local state and navigates, same as useLogout's contract. */
export function useDeleteAccount(): UseMutationResult<DeleteAccountResponse, Error, void> {
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.delete("/api/v1/me");
      return deleteAccountResponseSchema.parse(res.data.data);
    },
  });
}
