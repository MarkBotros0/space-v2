import { render, screen } from "@testing-library/react-native";
import { Text, View } from "react-native";

it("renders className-styled components under jest", () => {
  render(
    <View className="rounded-2xl bg-primary/92 p-4">
      <Text className="text-[0.8rem]">hello</Text>
    </View>,
  );
  expect(screen.getByText("hello")).toBeTruthy();
});
