import { screen } from "@testing-library/react-native";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { Text } from "react-native";

import { ShellFrame } from "../design/layout/shell-frame";
import { renderWithProviders } from "./helpers/render";

jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === "__tests__" ? [] : files(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

describe("page background (R32)", () => {
  it("ShellFrame draws no v1 navy-50 tint over the Screen's bg-background", () => {
    renderWithProviders(<ShellFrame><Text>Body</Text></ShellFrame>);
    const [content] = screen.UNSAFE_queryAllByProps({ testID: "screen-scroll" });
    expect(content?.props.contentContainerClassName).toEqual(expect.any(String));
    expect(content?.props.contentContainerClassName).not.toMatch(/brand-navy-50/);
  });

  it("no page, list or system-bar strip paints the old tint (the showcase swatch excepted)", () => {
    const root = path.join(__dirname, "../..");
    const offenders = [...files(path.join(root, "app")), ...files(path.join(root, "src"))]
      .filter((f) => !f.endsWith("showcase-data.tsx"))
      .filter((f) => /bg-brand-navy-50\b/.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(root, f));
    expect(offenders).toEqual([]);
  });
});
