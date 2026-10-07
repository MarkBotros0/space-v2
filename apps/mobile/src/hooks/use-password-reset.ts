import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import {
  passwordResetAckSchema,
  type ForgotPasswordBody,
  type PasswordResetAck,
  type ResetPasswordBody,
} from "@space/shared";

import { apiClient } from "../lib/api-client";

/** Anonymous. The ack is constant whether or not the address exists (R67). */
export function useForgotPassword(): UseMutationResult<PasswordResetAck, Error, ForgotPasswordBody> {
  return useMutation({
    mutationFn: async (body) => {
      const res = await apiClient.post("/api/v1/auth/forgot-password", body);
      return passwordResetAckSchema.parse(res.data.data);
    },
  });
}

/** Anonymous. One opaque failure (invalid_reset_token) for every bad token. */
export function useResetPassword(): UseMutationResult<PasswordResetAck, Error, ResetPasswordBody> {
  return useMutation({
    mutationFn: async (body) => {
      const res = await apiClient.post("/api/v1/auth/reset-password", body);
      return passwordResetAckSchema.parse(res.data.data);
    },
  });
}
