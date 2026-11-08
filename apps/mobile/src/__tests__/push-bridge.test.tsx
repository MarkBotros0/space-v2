const mockPush = jest.fn();
let mockLastResponse: unknown = null;
let mockReceived: (() => void) | null = null;

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  AndroidImportance: { HIGH: 4 },
  useLastNotificationResponse: () => mockLastResponse,
  addNotificationReceivedListener: (fn: () => void) => {
    mockReceived = fn;
    return { remove: jest.fn() };
  },
}));
jest.mock("expo-router", () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react-native";

import { PushNotificationsBridge } from "../components/PushNotificationsBridge";
import { queryKeys } from "../lib/query-keys";

function response(id: string, data: unknown) {
  return { notification: { request: { identifier: id, content: { data } } } };
}

function mount(client = new QueryClient()) {
  return render(
    <QueryClientProvider client={client}>
      <PushNotificationsBridge />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockPush.mockReset();
  mockLastResponse = null;
  mockReceived = null;
});

describe("PushNotificationsBridge", () => {
  it("opens the push's screen once per tapped notification", () => {
    mockLastResponse = response("n1", { type: "ASSIGNMENT_CREATED", target: { entityType: "assignment", entityId: 4 } });
    const view = mount();
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <PushNotificationsBridge />
      </QueryClientProvider>,
    );
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/assignment/[id]", params: { id: "4" } });
  });

  it("does nothing without a tapped notification", () => {
    mount();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("refreshes the inbox when a push arrives in the foreground", () => {
    const client = new QueryClient();
    const spy = jest.spyOn(client, "invalidateQueries");
    mount(client);
    mockReceived?.();
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.notifications.all });
  });

  it("refreshes the announcements feed and unread count when a push arrives", () => {
    const client = new QueryClient();
    const spy = jest.spyOn(client, "invalidateQueries");
    mount(client);
    mockReceived?.();
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.announcements.all });
  });
});
