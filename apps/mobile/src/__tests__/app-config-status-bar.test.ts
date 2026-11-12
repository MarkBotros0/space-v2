// apps/mobile/src/__tests__/app-config-status-bar.test.ts
/**
 * The iOS status bar follows the app's own theme, not the phone's. Expo's iOS template turns on
 * view-controller-based status bar appearance, which makes iOS ignore `<StatusBar style>` and pick
 * white icons whenever the phone is in dark mode, even on the app's light theme. Turning it off
 * hands the status bar back to `ThemedStatusBar` in `app/_layout.tsx`.
 */
import appJson from "../../app.json";

describe("iOS status bar", () => {
  it("is set by the app, not by each view controller", () => {
    const { ios } = appJson.expo as { ios: { infoPlist?: Record<string, unknown> } };
    expect(ios.infoPlist?.UIViewControllerBasedStatusBarAppearance).toBe(false);
  });
});
