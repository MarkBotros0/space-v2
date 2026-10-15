import { QrCode } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { parseCheckInCode, type SessionDetail } from "@space/shared";

import { iconWithClassName } from "../../design/lib/icon";
import {
  Button,
  FormField,
  Input,
  Modal,
  ModalContent,
  ModalDescription,
  ModalHeader,
  ModalTitle,
  Text,
} from "../../design/ui";
import { useCheckIn } from "../../hooks/use-check-in";
import { checkInRefusalCode, type CheckInOutcome } from "../../lib/check-in-result";
import { formatSessionTime } from "../../lib/format";
import { CheckInResult } from "./CheckInResult";
import { QrScanner } from "./QrScanner";

iconWithClassName(QrCode);

const NOT_A_CODE = "That doesn't look like a check-in code";

/**
 * The student's check-in on /session/[id] (v1 student-checkin-button.tsx): a
 * full-width "Check In" button, disabled until check-in opens, that opens a
 * scan sheet. Unlike v1 it POSTS the token rather than navigating to a
 * write-on-render page (R69/R72, spec 04 D3), shows the result in the sheet,
 * and keeps a typed-code fallback. Whether check-in is open is the server's
 * `checkInOpen` (C4) — never the client's own three-hour sum (R51, R73).
 */
export function StudentCheckInCard({ detail }: { detail: SessionDetail }) {
  const checkIn = useCheckIn();
  const [open, setOpen] = useState(false);
  const [entering, setEntering] = useState(false);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | undefined>(undefined);
  const [outcome, setOutcome] = useState<CheckInOutcome | null>(null);

  const checkedInAt = detail.myAttendance?.checkedInAt ?? null;
  const enabled = detail.checkInOpen && checkedInAt === null;

  const submit = (token: string) => {
    setOutcome(null);
    checkIn.mutate(token, {
      onSuccess: (data) => setOutcome({ kind: "checked_in", status: data.status, minutesLate: data.minutesLate }),
      onError: (err) => setOutcome({ kind: "refused", code: checkInRefusalCode(err) }),
    });
  };

  const submitTyped = () => {
    const token = parseCheckInCode(code);
    if (!token) {
      setCodeError(NOT_A_CODE);
      return;
    }
    setCodeError(undefined);
    setCode("");
    submit(token);
  };

  const openSheet = () => {
    setOutcome(null);
    setEntering(false);
    setOpen(true);
  };

  let sheet: ReactNode;
  if (checkIn.isPending) {
    sheet = <Text className="text-sm text-muted-foreground">Checking you in…</Text>;
  } else if (outcome !== null) {
    sheet = (
      <View className="items-center gap-4 py-2">
        <CheckInResult outcome={outcome} />
        <Button className="self-stretch" onPress={() => setOpen(false)}>
          Done
        </Button>
      </View>
    );
  } else if (entering) {
    sheet = (
      <View className="flex-col gap-3">
        <FormField label="Check-in code" error={codeError}>
          <Input
            accessibilityLabel="Check-in code"
            value={code}
            onChangeText={setCode}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </FormField>
        <Button onPress={submitTyped}>Check in</Button>
        <Pressable accessibilityRole="link" onPress={() => setEntering(false)} className="self-center">
          <Text className="text-sm text-muted-foreground">Scan instead</Text>
        </Pressable>
      </View>
    );
  } else {
    sheet = (
      <View className="flex-col gap-3">
        <QrScanner onCode={submit} onCancel={() => setOpen(false)} />
        <Pressable accessibilityRole="link" onPress={() => setEntering(true)} className="self-center">
          <Text className="text-sm text-muted-foreground">Enter code instead</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-col items-start gap-1.5">
      <Button size="lg" className="min-h-[44px] w-full" disabled={!enabled} onPress={openSheet}>
        <QrCode size={16} className="text-primary-foreground" />
        Check In
      </Button>
      {checkedInAt !== null ? (
        <Text className="text-sm text-neutral-500">{`You checked in at ${formatSessionTime(checkedInAt)}.`}</Text>
      ) : !detail.checkInOpen ? (
        <Text className="text-sm text-neutral-500">Check-in hasn't opened yet</Text>
      ) : null}
      <Modal open={open} onOpenChange={setOpen}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>Scan check-in code</ModalTitle>
            <ModalDescription>Point your camera at the QR code displayed by your leader.</ModalDescription>
          </ModalHeader>
          {sheet}
        </ModalContent>
      </Modal>
    </View>
  );
}
