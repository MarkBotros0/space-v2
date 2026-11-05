import { keyboardBottomOffset } from "../design/lib/keyboard-offset";

/**
 * Where a bar pinned to the bottom of a full-screen window (a sheet's Modal,
 * a screen) must sit so it rides on the keyboard. The keyboard height RN
 * reports differs per platform, and an Android window that is resized for the
 * keyboard needs no lift at all.
 */
describe("keyboardBottomOffset", () => {
  it("is the bottom safe-area inset while the keyboard is closed, on both platforms", () => {
    expect(keyboardBottomOffset({ os: "ios", keyboard: 0, insetBottom: 34 })).toBe(34);
    expect(keyboardBottomOffset({ os: "android", keyboard: 0, insetBottom: 48 })).toBe(48);
  });

  it("iOS: the keyboard frame already covers the home-indicator inset, so the keyboard height replaces it", () => {
    expect(keyboardBottomOffset({ os: "ios", keyboard: 336, insetBottom: 34 })).toBe(336);
  });

  it("Android edge-to-edge (window not resized): RN reports ime minus the nav bar, so the inset is added back", () => {
    // 3-button nav: 48dp bar, IME inset 330dp -> RN reports 282.
    expect(keyboardBottomOffset({ os: "android", keyboard: 282, insetBottom: 48 })).toBe(330);
    // Gesture nav: 24dp handle area.
    expect(keyboardBottomOffset({ os: "android", keyboard: 306, insetBottom: 24 })).toBe(330);
  });

  it("Android with a window resized for the keyboard: the window already ends at the keyboard, no lift", () => {
    expect(keyboardBottomOffset({ os: "android", keyboard: 282, insetBottom: 48, windowResized: true })).toBe(0);
  });

  it("uses the caller's closed offset (a shell's tab-bar padding) only while the keyboard is closed", () => {
    expect(keyboardBottomOffset({ os: "android", keyboard: 0, insetBottom: 48, closed: 114 })).toBe(114);
    expect(keyboardBottomOffset({ os: "android", keyboard: 282, insetBottom: 48, closed: 114 })).toBe(330);
    expect(keyboardBottomOffset({ os: "ios", keyboard: 336, insetBottom: 34, closed: 114 })).toBe(336);
  });
});
