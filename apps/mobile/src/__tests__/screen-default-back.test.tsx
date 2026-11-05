import { screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { Screen, ScreenChrome } from "../design/layout/screen";
import { ShellFrame } from "../design/layout/shell-frame";
import { TabBarPresenceContext } from "../design/layout/shell-context";
import { renderWithProviders } from "./helpers/render";

jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));

const body = <Text>Body</Text>;
const stacked = (node: React.ReactNode) => (
  <TabBarPresenceContext.Provider value={false}>{node}</TabBarPresenceContext.Provider>
);
const backLinks = () => screen.queryAllByRole("link", { name: "Back" });

describe("default back bar (ruling R23)", () => {
  it("a stacked Screen with no back prop shows the pinned bar", () => {
    renderWithProviders(stacked(<Screen title="Sara">{body}</Screen>));
    expect(backLinks()).toHaveLength(1);
  });

  it("a stacked ShellFrame and ScreenChrome show it too, once", () => {
    renderWithProviders(stacked(<ShellFrame>{body}</ShellFrame>));
    expect(backLinks()).toHaveLength(1);
    screen.unmount();
    renderWithProviders(stacked(<ScreenChrome>{body}</ScreenChrome>));
    expect(backLinks()).toHaveLength(1);
  });

  it("a tab screen shows none", () => {
    renderWithProviders(<Screen title="Today">{body}</Screen>);
    expect(backLinks()).toHaveLength(0);
    screen.unmount();
    renderWithProviders(
      <TabBarPresenceContext.Provider value={true}>
        <ShellFrame>{body}</ShellFrame>
      </TabBarPresenceContext.Provider>,
    );
    expect(backLinks()).toHaveLength(0);
  });

  it("back={null} opts a stacked screen out", () => {
    renderWithProviders(stacked(<Screen back={null}>{body}</Screen>));
    expect(backLinks()).toHaveLength(0);
    screen.unmount();
    renderWithProviders(stacked(<ShellFrame back={null}>{body}</ShellFrame>));
    expect(backLinks()).toHaveLength(0);
  });

  it("an explicit target wins over the default", () => {
    renderWithProviders(stacked(<ShellFrame back={{ label: "Students" }}>{body}</ShellFrame>));
    expect(screen.getAllByRole("link", { name: "Back to Students" })).toHaveLength(1);
    expect(backLinks()).toHaveLength(0);
  });
});
