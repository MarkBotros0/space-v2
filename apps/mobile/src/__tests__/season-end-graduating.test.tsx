import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));
jest.mock("../design/ui/toaster", () => ({ toast: { success: jest.fn(), error: jest.fn() }, Toaster: () => null }));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ code: "gbv-2026" }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), dismissAll: jest.fn(), replace: jest.fn() }),
}));

import { toast } from "../design/ui/toaster";
import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderStacked } from "./helpers/render";
import { check, detail, endBody } from "./helpers/season-end-fixtures";
import { makeSession } from "./helpers/session";
import EndSeasonScreen from "../../app/(app)/seasons/[code]/end";
import SeasonResultsScreen from "../../app/(app)/seasons/[code]/results";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;

function serve(routes: Record<string, unknown>) {
  get.mockImplementation((url: string) =>
    url in routes ? Promise.resolve({ data: { data: routes[url] } }) : Promise.reject(new Error(`not served: ${url}`)),
  );
}
const confirmEnd = () => fireEvent.press(screen.getAllByRole("button", { name: "End season" })[0]!);
const BY_CODE = "/api/v1/seasons/by-code/gbv-2026";
const END_CHECK = "/api/v1/seasons/7/end-check";

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("SUPER"));
});

describe("End of a graduating season", () => {
  const ended = (graduated: number) =>
    post.mockResolvedValue({ data: { data: { season: { id: 7, code: "gbv-2026", status: "COMPLETED" }, graduated } } });

  it("warns on the review, counts the graduates in the confirm and says so after", async () => {
    serve({ [BY_CODE]: detail(), "/api/v1/seasons/7/end-check": check({}, 13, true) });
    ended(12);
    renderStacked(<EndSeasonScreen />);
    await screen.findByText("Student 1");
    expect(screen.getByText("Passing makes them JPCS-26")).toBeTruthy();

    fireEvent.press(screen.getByText("Student 2"));
    fireEvent.press(screen.getByRole("tab", { name: "Did not pass" }));
    fireEvent.press(screen.getByText("Done"));
    fireEvent.press(screen.getByRole("button", { name: "End season" }));
    expect(await screen.findByText(/12 people will graduate\.$/)).toBeTruthy();

    confirmEnd();
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("GBV 2026 has ended. 12 people graduated."));
  });

  it("says one person, in the singular", async () => {
    serve({ [BY_CODE]: detail(), "/api/v1/seasons/7/end-check": check({}, 1, true) });
    ended(1);
    renderStacked(<EndSeasonScreen />);
    await screen.findByText("Student 1");
    fireEvent.press(screen.getByRole("button", { name: "End season" }));
    expect(await screen.findByText(/1 person will graduate\.$/)).toBeTruthy();
    confirmEnd();
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("GBV 2026 has ended. 1 person graduated."));
  });

  it("has no graduate line when nobody passes", async () => {
    serve({ [BY_CODE]: detail(), "/api/v1/seasons/7/end-check": check({}, 1, true) });
    ended(0);
    renderStacked(<EndSeasonScreen />);
    fireEvent.press(await screen.findByText("Student 1"));
    fireEvent.press(screen.getByRole("tab", { name: "Did not pass" }));
    fireEvent.press(screen.getByText("Done"));
    fireEvent.press(screen.getByRole("button", { name: "End season" }));
    await screen.findByText(/This finishes/);
    expect(screen.queryByText(/will graduate/)).toBeNull();
    confirmEnd();
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("GBV 2026 has ended."));
  });

  it("an ordinary season doesn't mention graduating", async () => {
    serve({ [BY_CODE]: detail(), "/api/v1/seasons/7/end-check": check({}, 3) });
    renderStacked(<EndSeasonScreen />);
    await screen.findByText("Student 1");
    expect(screen.queryByText("Passing makes them JPCS-26")).toBeNull();
    fireEvent.press(screen.getByRole("button", { name: "End season" }));
    await screen.findByText(/This finishes/);
    expect(screen.queryByText(/will graduate/)).toBeNull();
  });
});

describe("Correcting a result on a graduating season", () => {
  const open = async (graduatesOnPass: boolean) => {
    serve({
      [BY_CODE]: detail({ status: "COMPLETED", graduatesOnPass }),
      "/api/v1/seasons/7/results": {
        results: [
          {
            userId: 1,
            name: "Mina",
            isAlumnus: true,
            groupName: null,
            attendancePct: 90,
            result: "PASSED",
            reason: null,
          },
          {
            userId: 2,
            name: "Nour",
            isAlumnus: false,
            groupName: null,
            attendancePct: 40,
            result: "NOT_PASSED",
            reason: null,
          },
        ],
      },
    });
    renderStacked(<SeasonResultsScreen />);
    await screen.findByText("Mina");
  };
  const KEEPS = "This doesn't remove their alumni status.";
  const WILL =
    "Passing makes them JPCS-26. Any regular season they're in now ends for them. A community-wide season carries on.";

  it("says Did not pass doesn't remove alumni status", async () => {
    await open(true);
    fireEvent.press(screen.getByText("Mina"));
    expect(screen.queryByText(KEEPS)).toBeNull();
    fireEvent.press(screen.getByRole("tab", { name: "Did not pass" }));
    expect(screen.getByText(KEEPS)).toBeTruthy();
  });

  it("says Passed graduates someone who isn't an alumnus yet", async () => {
    await open(true);
    fireEvent.press(screen.getByText("Nour"));
    expect(screen.queryByText(WILL)).toBeNull();
    fireEvent.press(screen.getByRole("tab", { name: "Passed" }));
    expect(screen.getByText(WILL)).toBeTruthy();
  });

  it("says neither on an ordinary season", async () => {
    await open(false);
    fireEvent.press(screen.getByText("Mina"));
    fireEvent.press(screen.getByRole("tab", { name: "Did not pass" }));
    expect(screen.queryByText(KEEPS)).toBeNull();
  });
});

describe("A stale review", () => {
  const rosterChanged = {
    isAxiosError: true,
    response: {
      status: 409,
      data: { error: { code: "season_unfinished", message: "The roster changed; check the season again." } },
    },
  };
  const markStudent2 = () => {
    fireEvent.press(screen.getByText("Student 2"));
    fireEvent.press(screen.getByRole("tab", { name: "Did not pass" }));
    fireEvent.changeText(screen.getByLabelText("Reason"), "Absent");
    fireEvent.press(screen.getByText("Done"));
  };

  it("sends what the screen shows", async () => {
    serve({ [BY_CODE]: detail(), [END_CHECK]: check({}, 2, true) });
    post.mockResolvedValue({
      data: { data: { season: { id: 7, code: "gbv-2026", status: "COMPLETED" }, graduated: 2 } },
    });
    renderStacked(<EndSeasonScreen />);
    await screen.findByText("Student 1");
    fireEvent.press(screen.getByRole("button", { name: "End season" }));
    await screen.findByText(/This finishes/);
    confirmEnd();
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/api/v1/seasons/7/end",
        endBody([], { graduatesOnPass: true, userIds: [1, 2] }),
      ),
    );
  });

  it("refetches on the refusal, shows the warning, keeps staged results and sends the new review", async () => {
    serve({ [BY_CODE]: detail(), [END_CHECK]: check({}, 2, false) });
    post.mockRejectedValueOnce(rosterChanged);
    renderStacked(<EndSeasonScreen />);
    await screen.findByText("Student 1");
    markStudent2();
    expect(screen.queryByText("Passing makes them JPCS-26")).toBeNull();

    // A super ticks Graduating season and a student joins while the review is open.
    serve({ [BY_CODE]: detail(), [END_CHECK]: check({}, 3, true) });
    fireEvent.press(screen.getByRole("button", { name: "End season" }));
    await screen.findByText(/This finishes/);
    confirmEnd();

    expect(await screen.findByText("Passing makes them JPCS-26")).toBeTruthy();
    expect(toast.error).toHaveBeenCalledWith("The roster changed; check the season again.");
    expect(await screen.findByText("Student 3")).toBeTruthy();
    expect(screen.getAllByText("Did not pass")).toHaveLength(1);

    post.mockResolvedValueOnce({
      data: { data: { season: { id: 7, code: "gbv-2026", status: "COMPLETED" }, graduated: 2 } },
    });
    fireEvent.press(screen.getByRole("button", { name: "End season" }));
    expect(await screen.findByText(/2 people will graduate\.$/)).toBeTruthy();
    confirmEnd();
    await waitFor(() =>
      expect(post).toHaveBeenLastCalledWith(
        "/api/v1/seasons/7/end",
        endBody([{ userId: 2, reason: "Absent" }], { graduatesOnPass: true, userIds: [1, 2, 3] }),
      ),
    );
  });

  it("drops a staged result for someone no longer in the review, so the retry isn't refused", async () => {
    serve({ [BY_CODE]: detail(), [END_CHECK]: check({}, 2, true) });
    post.mockRejectedValueOnce(rosterChanged);
    renderStacked(<EndSeasonScreen />);
    await screen.findByText("Student 1");
    markStudent2();

    serve({ [BY_CODE]: detail(), [END_CHECK]: check({}, 1, true) });
    fireEvent.press(screen.getByRole("button", { name: "End season" }));
    await screen.findByText(/This finishes/);
    confirmEnd();
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText("Student 2")).toBeNull(), { timeout: 5000 });

    post.mockResolvedValueOnce({
      data: { data: { season: { id: 7, code: "gbv-2026", status: "COMPLETED" }, graduated: 1 } },
    });
    fireEvent.press(screen.getByRole("button", { name: "End season" }));
    expect(await screen.findByText(/1 person will graduate\.$/)).toBeTruthy();
    confirmEnd();
    await waitFor(() =>
      expect(post).toHaveBeenLastCalledWith(
        "/api/v1/seasons/7/end",
        endBody([], { graduatesOnPass: true, userIds: [1] }),
      ),
    );
  });
});
