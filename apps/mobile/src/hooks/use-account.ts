import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import { deleteAccountResponseSchema, type DeleteAccountResponse } from "@space/shared";

import { apiSend } from "../lib/api-request";

/** DELETE /me — the account holder deletes their own account. The server
 *  ends every session and drops this account's push devices; the caller
 *  clears local state and navigates, same as useLogout's contract. */
export function useDeleteAccount(): UseMutationResult<DeleteAccountResponse, Error, void> {
  return useMutation({
    mutationFn: () => apiSend("delete", "/api/v1/me", undefined, deleteAccountResponseSchema),
  });
}
