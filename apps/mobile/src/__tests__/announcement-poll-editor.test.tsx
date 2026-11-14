import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";
jest.mock("../design/ui/rich-text-editor", () => require("./helpers/rich-text-editor-mock"));

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
const mockReplace = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, back: mockBack, push: jest.fn() }),
  useLocalSearchParams: () => ({ id: "7" }),
}));

import { apiClient } from "../lib/api-client";
import { renderWithProviders } from "./helpers/render";
import { detailItem, ok, pollItem } from "./helpers/announcements";

import NewAnnouncementScreen from "../../app/(app)/announcements/new";
import EditAnnouncementScreen from "../../app/(app)/announcements/[id]/edit";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;
const patch = apiClient.patch as jest.Mock;

const adminTargets = {
  community: false,
  communityReach: 0,
  seasons: [{ id: 3, code: "SP26", title: "Test Season", reach: 5 }],
};

async function openNew() {
  get.mockImplementation((url: string) =>
    url.endsWith("/targets") ? ok(adminTargets) : Promise.reject(new Error(url)),
  );
  renderWithProviders(<NewAnnouncementScreen />);
  fireEvent.changeText(await screen.findByLabelText("Message"), "Vote please");
}
const addPoll = () => fireEvent.press(screen.getByLabelText("Add a poll"));
const option = (n: number) => screen.getByLabelText(`Option ${n}`);

beforeEach(() => jest.clearAllMocks());

describe("Poll editor in the composer", () => {
  it("Add a poll shows two option fields and Remove poll takes it away", async () => {
    await openNew();
    expect(screen.queryByLabelText("Option 1")).toBeNull();
    addPoll();
    expect(option(1)).toBeTruthy();
    expect(option(2)).toBeTruthy();
    expect(screen.queryByLabelText("Option 3")).toBeNull();
    expect(screen.queryByLabelText("Remove option 1")).toBeNull();
    fireEvent.press(screen.getByLabelText("Remove poll"));
    expect(screen.queryByLabelText("Option 1")).toBeNull();
    expect(screen.getByLabelText("Add a poll")).toBeTruthy();
  });

  it("Add option stops at 10 and removing stops at two", async () => {
    await openNew();
    addPoll();
    for (let i = 0; i < 8; i++) fireEvent.press(screen.getByLabelText("Add option"));
    expect(option(10)).toBeTruthy();
    expect(screen.queryByLabelText("Add option")).toBeNull();
    for (let i = 0; i < 8; i++) fireEvent.press(screen.getByLabelText("Remove option 3"));
    expect(screen.queryByLabelText("Option 3")).toBeNull();
    expect(screen.queryByLabelText(/^Remove option/)).toBeNull();
  });

  it("shows a duplicate and an empty option as errors on the field", async () => {
    await openNew();
    addPoll();
    fireEvent.changeText(option(1), "Same");
    fireEvent.changeText(option(2), " same ");
    fireEvent.press(screen.getByText("Post"));
    expect(option(2).props.accessibilityHint).toBe("Two options say the same thing.");
    fireEvent.changeText(option(2), "");
    fireEvent.press(screen.getByText("Post"));
    expect(option(2).props.accessibilityHint).toBe("Enter this option (up to 150 characters).");
    expect(screen.queryByText("Post to Test Season?")).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it("posts the poll with labels and no ids, and says so in the confirm", async () => {
    await openNew();
    post.mockResolvedValue(ok(detailItem(42)));
    addPoll();
    fireEvent.changeText(option(1), " Saturday ");
    fireEvent.changeText(option(2), "Sunday");
    fireEvent(screen.getByLabelText("Let people pick more than one"), "press");
    fireEvent.press(screen.getByText("Post"));
    expect(await screen.findByText("This notifies 5 people, with a poll.")).toBeTruthy();
    fireEvent.press(within(screen.getByTestId("sheet-save-bar")).getByText("Post"));
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith("/api/v1/announcements", {
      audience: "SEASON",
      seasonId: 3,
      body: "Vote please",
      poll: { allowsMultiple: true, options: [{ label: "Saturday" }, { label: "Sunday" }] },
    });
  });
});

describe("Poll editor on edit", () => {
  const withPoll = () => ok(detailItem(7, { canEdit: true, poll: pollItem({ allowsMultiple: true }) }));

  it("prefills the poll and sends the ids back", async () => {
    get.mockReturnValue(withPoll());
    patch.mockResolvedValue(ok(detailItem(7)));
    renderWithProviders(<EditAnnouncementScreen />);
    expect((await screen.findByLabelText("Option 1")).props.value).toBe("Saturday");
    fireEvent.changeText(option(2), "Monday");
    fireEvent.press(screen.getByText("Save"));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(patch).toHaveBeenCalledWith("/api/v1/announcements/7", {
      body: "<p>Full body https://example.com/x.</p>",
      poll: {
        allowsMultiple: true,
        options: [
          { id: 1, label: "Saturday" },
          { id: 2, label: "Monday" },
        ],
      },
    });
  });

  it("sends poll null once the poll is removed", async () => {
    get.mockReturnValue(withPoll());
    patch.mockResolvedValue(ok(detailItem(7)));
    renderWithProviders(<EditAnnouncementScreen />);
    await screen.findByLabelText("Option 1");
    fireEvent.press(screen.getByLabelText("Remove poll"));
    fireEvent.press(screen.getByText("Save"));
    await waitFor(() => expect(patch).toHaveBeenCalled());
    expect(patch).toHaveBeenCalledWith("/api/v1/announcements/7", {
      body: "<p>Full body https://example.com/x.</p>",
      poll: null,
    });
  });
});
