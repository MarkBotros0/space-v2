const mockPrevent = jest.fn(async (_key?: string) => undefined);
const mockAllow = jest.fn(async (_key?: string) => undefined);
const mockRemove = jest.fn();
let mockShot: (() => void) | null = null;

jest.mock("expo-screen-capture", () => ({
  preventScreenCaptureAsync: (k?: string) => mockPrevent(k),
  allowScreenCaptureAsync: (k?: string) => mockAllow(k),
  addScreenshotListener: (fn: () => void) => {
    mockShot = fn;
    return { remove: mockRemove };
  },
}));

import { render, screen } from "@testing-library/react-native";

import { presentNotification } from "../lib/notification-presentation";
import { useCaptureLock } from "../screens/quiz-detail/lock/use-capture-lock";
import { useNotificationHold } from "../screens/quiz-detail/lock/use-notification-hold";
import { Essay } from "../screens/quiz-detail/questions/essay";
import { FillBlank } from "../screens/quiz-detail/questions/fill-blank";
import { useQuizLockStore } from "../store/quiz-lock";

function Capture({ active, onShot }: { active: boolean; onShot: () => void }) {
  useCaptureLock(active, onShot);
  return null;
}
function Hold({ active }: { active: boolean }) {
  useNotificationHold(active, 7);
  return null;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockShot = null;
  useQuizLockStore.getState().setOpenAttempt(null);
});

describe("quiz locks", () => {
  it("capture is prevented while active and released after", () => {
    const view = render(<Capture active onShot={jest.fn()} />);
    expect(mockPrevent).toHaveBeenCalledTimes(1);
    expect(mockAllow).not.toHaveBeenCalled();
    view.rerender(<Capture active={false} onShot={jest.fn()} />);
    expect(mockAllow).toHaveBeenCalledTimes(1);
    expect(mockRemove).toHaveBeenCalled();
  });

  it("is not prevented while inactive", () => {
    render(<Capture active={false} onShot={jest.fn()} />);
    expect(mockPrevent).not.toHaveBeenCalled();
  });

  it("screenshot listener calls onScreenshot", () => {
    const onShot = jest.fn();
    render(<Capture active onShot={onShot} />);
    mockShot?.();
    expect(onShot).toHaveBeenCalledTimes(1);
  });

  it("notification handler hides banners while an attempt is open", async () => {
    expect(await presentNotification()).toMatchObject({ shouldShowBanner: true, shouldPlaySound: true });
    const view = render(<Hold active />);
    expect(useQuizLockStore.getState().openAttemptQuizId).toBe(7);
    expect(await presentNotification()).toMatchObject({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
    });
    view.unmount();
    expect(useQuizLockStore.getState().openAttemptQuizId).toBeNull();
    expect(await presentNotification()).toMatchObject({ shouldShowBanner: true });
  });

  it("answer inputs hide the paste menu and autocorrect", () => {
    render(
      <>
        <Essay
          index={0}
          question={{ id: 1, type: "ESSAY", prompt: "Why?" } as never}
          answer={{ text: "" }}
          onChange={jest.fn()}
        />
        <FillBlank
          index={1}
          question={{ id: 2, type: "FILL_BLANK", prompt: "A {{1}} b", blanks: [{ id: 5, position: 0 }] } as never}
          answer={{ blanks: [] }}
          onChange={jest.fn()}
        />
      </>,
    );
    for (const label of ["Answer 1", "Blank 1"]) {
      expect(screen.getByLabelText(label).props).toMatchObject({
        contextMenuHidden: true,
        autoCorrect: false,
        spellCheck: false,
        autoComplete: "off",
        importantForAutofill: "no",
        textContentType: "none",
      });
    }
  });
});
