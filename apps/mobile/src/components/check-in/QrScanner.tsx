import { CameraView, useCameraPermissions } from "expo-camera";
import { useRef, useState, type ReactNode } from "react";
import { Linking, View } from "react-native";
import { parseCheckInCode } from "@space/shared";

import { useTheme } from "../../theme";
import { Button, Text } from "../../ui";

export interface QrScannerProps {
  /** Called once, with a token parseCheckInCode accepted. */
  onCode: (token: string) => void;
  onCancel: () => void;
}

/**
 * expo-camera's barcode scanner in place of v1's WASM qr-scanner
 * (qr-scanner-view.tsx). The permission flow has no v1 equivalent (spec 04 §9
 * row 7): undecided → ask; denied for good → the OS settings, with the code
 * field still one tap away (Cancel → Enter code).
 */
export function QrScanner({ onCode, onCancel }: QrScannerProps) {
  const theme = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  // The camera reports the same frame many times a second; one write only.
  const handled = useRef(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const onScanned = ({ data }: { data: string }) => {
    if (handled.current) return;
    const token = parseCheckInCode(data);
    if (!token) {
      setScanError("That doesn't look like a check-in code.");
      return;
    }
    handled.current = true;
    onCode(token);
  };

  let body: ReactNode;
  if (!permission) {
    body = <Text variant="body">Checking camera access…</Text>;
  } else if (!permission.granted && permission.canAskAgain) {
    body = (
      <>
        <Text variant="body">JPC Space needs your camera to scan the check-in code your leader shows.</Text>
        <Button title="Allow camera" onPress={() => void requestPermission()} />
      </>
    );
  } else if (!permission.granted) {
    body = (
      <>
        <Text variant="body">
          Camera access is turned off for JPC Space. Turn it on in Settings, or enter the code instead.
        </Text>
        <Button title="Open settings" variant="secondary" onPress={() => void Linking.openSettings()} />
      </>
    );
  } else {
    body = (
      <>
        <View style={{ height: 280, borderRadius: theme.radii.lg, overflow: "hidden" }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={onScanned}
          />
        </View>
        <Text variant="caption" color={theme.colors.neutral[600]}>
          Point your camera at the QR code displayed by your leader.
        </Text>
        {scanError ? (
          <Text variant="label" color={theme.colors.error[600]} accessibilityRole="alert">
            {scanError}
          </Text>
        ) : null}
      </>
    );
  }

  return (
    <View style={{ gap: theme.spacing.sm }}>
      {body}
      <Button title="Cancel" variant="ghost" onPress={onCancel} />
    </View>
  );
}
