import { screen } from "@testing-library/react-native";
import type { SeasonRecord } from "@space/shared";

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));

import { QuizzesList } from "../screens/past-season/record-lists";
import { renderWithProviders } from "./helpers/render";

const record = (quizzes: SeasonRecord["quizzes"]) => ({ quizzes }) as SeasonRecord;

describe("a finished season's quizzes", () => {
  it("the admin's score says whose it is, with the note", () => {
    renderWithProviders(
      <QuizzesList
        record={record([
          {
            id: 1,
            title: "Week 1 quiz",
            kind: "ONLINE",
            status: "GRADED",
            score: 7.5,
            adminScore: { score: 7.5, notes: "Taken on paper." },
          },
          { id: 2, title: "Week 2 quiz", kind: "ONLINE", status: "GRADED", score: 6, adminScore: null },
        ])}
      />,
    );
    expect(screen.getByText("Score entered by your admin")).toBeTruthy();
    expect(screen.getByText(/Taken on paper\./)).toBeTruthy();
    expect(screen.getAllByText("Score entered by your admin")).toHaveLength(1);
    expect(screen.getByText("Score: 6")).toBeTruthy();
  });
});
