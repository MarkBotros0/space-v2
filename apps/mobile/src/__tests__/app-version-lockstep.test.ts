// apps/mobile/src/__tests__/app-version-lockstep.test.ts
/**
 * Owner, 2026-11-09: version 1.0.N ships as build N, on both stores, and
 * EAS never picks the number (local versioning). Bump with
 * `pnpm --filter @space/mobile version:bump`, never one field by hand.
 */
import appJson from "../../app.json";
import easJson from "../../eas.json";

describe("app version and build number", () => {
  it("move together: version x.y.N is iOS build N and Android versionCode N", () => {
    const { version, ios, android } = appJson.expo as {
      version: string;
      ios: { buildNumber?: string };
      android: { versionCode?: number };
    };
    const n = Number(/^\d+\.\d+\.(\d+)$/.exec(version)?.[1]);
    expect(Number.isInteger(n)).toBe(true);
    expect(ios.buildNumber).toBe(String(n));
    expect(android.versionCode).toBe(n);
  });

  it("are kept in app.json, so EAS can't bump one without the other", () => {
    expect(easJson.cli.appVersionSource).toBe("local");
    expect(easJson.build.production).not.toHaveProperty("autoIncrement");
  });
});
