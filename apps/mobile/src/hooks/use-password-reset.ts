import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import {
  passwordResetAckSchema,
  type ForgotPasswordBody,
  type PasswordResetAck,
  type ResetPasswordBody,
} from "@space/shared";

import { apiSend } from "../lib/api-request";

/** Anonymous. The ack is constant whether or not the address exists (R67). */
export function useForgotPassword(): UseMutationResult<PasswordResetAck, Error, ForgotPasswordBody> {
  return useMutation({
    mutationFn: (body) => apiSend("post", "/api/v1/auth/forgot-password", body, passwordResetAckSchema),
  });
}

/** Anonymous. One opaque failure (invalid_reset_token) for every bad token. */
export function useResetPassword(): UseMutationResult<PasswordResetAck, Error, ResetPasswordBody> {
  return useMutation({
    mutationFn: (body) => apiSend("post", "/api/v1/auth/reset-password", body, passwordResetAckSchema),
  });
}
