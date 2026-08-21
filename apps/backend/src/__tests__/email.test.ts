const sendMail = jest.fn().mockResolvedValue({ messageId: "test" });

jest.mock("nodemailer", () => ({
  __esModule: true,
  default: { createTransport: jest.fn(() => ({ sendMail })) },
  createTransport: jest.fn(() => ({ sendMail })),
}));

// config is read at module load, so each test re-imports both modules under a
// fresh module registry with the env it wants.
function loadEmail(env: Record<string, string | undefined>) {
  jest.resetModules();
  const saved = { ...process.env };
  Object.assign(process.env, env);
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports -- inline import() type needed here so require() re-runs against a fresh module registry per call
  const mod = require("../lib/email") as typeof import("../lib/email");
  process.env = saved;
  return mod;
}

beforeEach(() => {
  sendMail.mockClear();
});

describe("sendNotificationEmail", () => {
  it("sends when credentials are configured", async () => {
    const { sendNotificationEmail } = loadEmail({
      GMAIL_USER: "sender@example.test",
      GMAIL_APP_PASSWORD: "app-password",
      AUTH_URL: "https://space.example.test",
    });

    await sendNotificationEmail("student@example.test", "Two absences", "Reach out.", "/admin/students/5");

    expect(sendMail).toHaveBeenCalledTimes(1);
    const call = sendMail.mock.calls[0][0];
    expect(call.to).toBe("student@example.test");
    expect(call.subject).toBe("JPC Space — Two absences");
    expect(call.html).toContain("Reach out.");
    expect(call.html).toContain("https://space.example.test/admin/students/5");
  });

  it("omits the link button when AUTH_URL is unset", async () => {
    const { sendNotificationEmail } = loadEmail({
      GMAIL_USER: "sender@example.test",
      GMAIL_APP_PASSWORD: "app-password",
      AUTH_URL: undefined,
    });

    await sendNotificationEmail("student@example.test", "Title", null, "/somewhere");

    const call = sendMail.mock.calls[0][0];
    expect(call.html).not.toContain("/somewhere");
  });

  it("is a no-op when credentials are absent", async () => {
    const { sendNotificationEmail } = loadEmail({
      GMAIL_USER: undefined,
      GMAIL_APP_PASSWORD: undefined,
    });

    await expect(
      sendNotificationEmail("student@example.test", "Title", null, null),
    ).resolves.toBeUndefined();
    expect(sendMail).not.toHaveBeenCalled();
  });
});
