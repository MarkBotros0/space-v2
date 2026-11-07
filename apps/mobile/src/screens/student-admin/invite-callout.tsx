/**
 * On a student's page, for staff, while the account isn't set up (owner,
 * 2026-11-07: admins and supers resend the invitation): what state the invite
 * is in, in words, and one button that sends a fresh one. The older code stops
 * working only once the new email has gone (the server's rule).
 */
import type { StudentInviteState } from "@space/shared";
import { View } from "react-native";

import { Button } from "../../design/ui/button";
import { Text } from "../../design/ui/text";
import { toast } from "../../design/ui/toaster";
import { useResendStudentInvite } from "../../hooks/use-students";
import { formatDate } from "../../lib/format";
import { inviteErrorMessage, inviteSentMessage } from "../../lib/invite-feedback";

export function InviteCallout({
  studentId,
  email,
  invite,
}: {
  studentId: number;
  email: string;
  invite: NonNullable<StudentInviteState>;
}) {
  const resend = useResendStudentInvite();
  const invited = invite.status === "invited";
  const body = invited
    ? `Their invite works until ${formatDate(invite.expiresAt)}. If they can't find it, send a new one.`
    : "They have no invite that still works. Send one so they can choose a password.";
  return (
    <View testID="invite-callout" className="flex-col gap-3 rounded-group bg-info-soft p-4">
      <View className="flex-col gap-1">
        <Text variant="headline">Hasn't set up their account yet</Text>
        <Text variant="subhead" className="text-foreground">
          {body}
        </Text>
      </View>
      <Button
        className="self-start"
        loading={resend.isPending}
        onPress={() =>
          resend.mutate(
            { id: studentId },
            {
              onSuccess: () => toast.success(inviteSentMessage(email)),
              onError: (err) => toast.error(inviteErrorMessage(err)),
            },
          )
        }
      >
        {invited ? "Resend invite" : "Send invite"}
      </Button>
    </View>
  );
}
