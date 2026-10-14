import { CameraView, useCameraPermissions } from "expo-camera";
import { useRef, useState, type ReactNode } from "react";
import { Linking, View } from "react-native";
import { parseCheckInCode } from "@space/shared";

import { Button, Text } from "../../design/ui";

export interface QrScannerProps {
  /** Called once, with a token parseCheckInCode accepted. */
  onCode: (token: string) => void;
  onCancel: () => void;
}

/**
 * expo-camera's barcode scanner in place of v1's WASM qr-scanner
 * (qr-scanner-view.tsx: `overflow-hidden rounded-xl bg-black` around the
 * video). The permission flow has no v1 equivalent (spec 04 §9 row 7):
 * undecided → ask; denied for good → the OS settings, with the code field
 * still one tap away ("Enter code instead").
 */
export function QrScanner({ onCode, onCancel }: QrScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  // The camera reports the same frame many times a second; one write only.
  const handled = useRef(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const onScanned = ({ data }: { data: string }) => {
    if (handled.current) return;
    const token = parseCheckInCode(data);
    if (!token) {
      setScanError("That doesn't look like a check-in code");
      return;
    }
    handled.current = true;
    onCode(token);
  };

  let body: ReactNode;
  if (!permission) {
    body = <Text className="text-sm text-muted-foreground">Checking camera access…</Text>;
  } else if (!permission.granted && permission.canAskAgain) {
    body = (
      <>
        <Text className="text-sm text-muted-foreground">
          JPC Space needs your camera to scan the check-in code your leader shows.
        </Text>
        <Button onPress={() => void requestPermission()}>Allow camera</Button>
      </>
    );
  } else if (!permission.granted) {
    body = (
      <>
        <Text className="text-sm text-muted-foreground">
          Camera access is turned off for JPC Space. Turn it on in Settings, or enter the code instead.
        </Text>
        <Button variant="outline" onPress={() => void Linking.openSettings()}>
          Open settings
        </Button>
      </>
    );
  } else {
    body = (
      <>
        <View className="aspect-video w-full overflow-hidden rounded-xl bg-black">
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={onScanned}
          />
        </View>
        {scanError ? (
          <Text accessibilityRole="alert" className="text-sm text-error-600 dark:text-error-400">
            {scanError}
          </Text>
        ) : null}
      </>
    );
  }

  return (
    <View className="flex-col gap-3">
      {body}
      <Button variant="ghost" onPress={onCancel}>
        Cancel
      </Button>
    </View>
  );
}
