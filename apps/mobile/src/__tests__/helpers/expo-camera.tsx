import { act } from "@testing-library/react-native";
import { Text } from "react-native";

/*
 * Jest stand-in for expo-camera (native module — nothing to render under
 * the test renderer). Usage in a test file:
 *   jest.mock("expo-camera", () => require("./helpers/expo-camera"));
 *   import { resetMockCamera, scanMockBarcode, mockCamera } from "./helpers/expo-camera";
 * The factory `require`s this module, so the test's import receives the same
 * instance and can set the permission and simulate a decoded QR code.
 */
export interface MockPermission {
  granted: boolean;
  canAskAgain: boolean;
  status: "granted" | "denied" | "undetermined";
}

type ScanHandler = (result: { data: string }) => void;

export const mockCamera: {
  permission: MockPermission | null;
  requestPermission: jest.Mock;
  onBarcodeScanned: ScanHandler | null;
} = {
  permission: null,
  requestPermission: jest.fn(),
  onBarcodeScanned: null,
};

export const GRANTED: MockPermission = { granted: true, canAskAgain: true, status: "granted" };

export function resetMockCamera(permission: MockPermission | null = GRANTED): void {
  mockCamera.permission = permission;
  mockCamera.requestPermission = jest.fn(() => Promise.resolve(permission));
  mockCamera.onBarcodeScanned = null;
}

/** Simulates the camera decoding a QR code. */
export function scanMockBarcode(data: string): void {
  act(() => {
    mockCamera.onBarcodeScanned?.({ data });
  });
}

export function useCameraPermissions(): [MockPermission | null, jest.Mock] {
  return [mockCamera.permission, mockCamera.requestPermission];
}

export function CameraView(props: { onBarcodeScanned?: ScanHandler }) {
  mockCamera.onBarcodeScanned = props.onBarcodeScanned ?? null;
  return <Text testID="mock-camera">camera</Text>;
}
