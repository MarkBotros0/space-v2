import axios from "axios";

import { apiErrorCode, apiErrorMessage } from "./api-error";

/**
 * What to tell a SUPER when POST /users/:id/invite fails, by the envelope's
 * code (screens branch on codes, never message text). Shared by the users
 * list's row button and the user detail's header button.
 */
export function inviteErrorMessage(err: unknown): string {
  switch (apiErrorCode(err)) {
    case "already_activated":
      return "This account is already activated, so it doesn't need an invite.";
    case "user_deleted":
      return "This account is deactivated. Reactivate it before sending an invite.";
    case "email_not_configured":
      return "Email isn't set up on the server, so invites can't be sent right now.";
    case "email_send_failed":
      return "The invite email couldn't be sent. Any earlier invite still works. Try again later.";
    default:
      break;
  }
  if (axios.isAxiosError(err) && !err.response) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  return apiErrorMessage(err, "Couldn't send the invite. Try again.");
}

export function inviteSentMessage(email: string): string {
  return `Invite sent to ${email}.`;
}
