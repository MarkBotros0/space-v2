import { render, screen, within } from "@testing-library/react-native";

import { BandDonut } from "../components/charts/BandDonut";

it("names every band with its count beside the ring: colour alone says nothing", () => {
  render(
    <BandDonut
      bands={[
        { band: "HIGH", count: 3 },
        { band: "MEDIUM", count: 0 },
        { band: "LOW", count: 1 },
        { band: "AT_RISK", count: 2 },
      ]}
    />,
  );
  const legend = within(screen.getByTestId("band-legend"));
  for (const entry of ["High 3", "Medium 0", "Low 1", "At risk 2"]) {
    expect(legend.getByText(entry)).toBeTruthy();
  }
});
