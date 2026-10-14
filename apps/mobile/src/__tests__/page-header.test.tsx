import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { PageHeader } from "../design/layout/page-header";

it("renders title, description and actions", () => {
  render(<PageHeader title="Calendar" description="All sessions" actions={<Text>New</Text>} />);
  expect(screen.getByRole("header")).toHaveTextContent("Calendar");
  expect(screen.getByText("All sessions")).toBeTruthy();
  expect(screen.getByText("New")).toBeTruthy();
});

it("omits the description when not given", () => {
  render(<PageHeader title="Calendar" />);
  expect(screen.queryByText("All sessions")).toBeNull();
});
