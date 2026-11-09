import { fireEvent, screen } from "@testing-library/react-native";

import { QueryGate } from "../design/layout/route-states";
import { Text } from "../design/ui/text";
import { renderWithProviders } from "./helpers/render";

const base = { isPending: false, isError: false, refetch: jest.fn() };

describe("QueryGate", () => {
  it("shows the skeleton while pending", () => {
    renderWithProviders(
      <QueryGate query={{ ...base, isPending: true, data: undefined }}>{() => <Text>body</Text>}</QueryGate>,
    );
    expect(screen.getByLabelText("Loading")).toBeTruthy();
    expect(screen.queryByText("body")).toBeNull();
  });

  it("shows the route error on failure, and Try again refetches", () => {
    const refetch = jest.fn();
    renderWithProviders(
      <QueryGate query={{ ...base, isError: true, refetch, data: undefined }}>{() => <Text>body</Text>}</QueryGate>,
    );
    fireEvent.press(screen.getByText("Try again"));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("renders its children with the data", () => {
    renderWithProviders(<QueryGate query={{ ...base, data: { n: 3 } }}>{(d) => <Text>{`n=${d.n}`}</Text>}</QueryGate>);
    expect(screen.getByText("n=3")).toBeTruthy();
  });
});
