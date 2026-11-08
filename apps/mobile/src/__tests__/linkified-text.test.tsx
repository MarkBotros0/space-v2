import { fireEvent, screen } from "@testing-library/react-native";
import { Linking } from "react-native";

import { LinkifiedText, linkify } from "../screens/announcements/linkified-text";
import { renderWithProviders } from "./helpers/render";

describe("linkify", () => {
  it("splits a plain URL out of the text", () => {
    expect(linkify("see https://example.com/a now")).toEqual([
      { kind: "text", value: "see " },
      { kind: "link", url: "https://example.com/a" },
      { kind: "text", value: " now" },
    ]);
  });

  it("leaves trailing punctuation out of the link", () => {
    expect(linkify("go to https://example.com.")).toEqual([
      { kind: "text", value: "go to " },
      { kind: "link", url: "https://example.com" },
      { kind: "text", value: "." },
    ]);
    expect(linkify("(https://example.com/a)")).toEqual([
      { kind: "text", value: "(" },
      { kind: "link", url: "https://example.com/a" },
      { kind: "text", value: ")" },
    ]);
  });

  it("never links javascript: or other schemes", () => {
    expect(linkify("javascript:alert(1) and ftp://x.test")).toEqual([
      { kind: "text", value: "javascript:alert(1) and ftp://x.test" },
    ]);
  });

  it("returns plain text as one run", () => {
    expect(linkify("hello")).toEqual([{ kind: "text", value: "hello" }]);
    expect(linkify("")).toEqual([]);
  });
});

describe("LinkifiedText", () => {
  it("opens a link and marks it as a link", () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue();
    renderWithProviders(<LinkifiedText text="read https://example.com/a." />);
    const link = screen.getByRole("link");
    fireEvent.press(link);
    expect(open).toHaveBeenCalledWith("https://example.com/a");
  });
});
