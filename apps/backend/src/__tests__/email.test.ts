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
  for (const [k, v] of Object.entries(env)) {
    // Object.assign(process.env, { KEY: undefined }) does NOT delete the key —
    // Node's env setter coerces it to the string "undefined", which is truthy
    // and would pass z.string().optional() in config.ts. Deleting explicitly
    // is the only way to simulate an unset env var.
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports -- inline import() type needed here so require() re-runs against a fresh module registry per call
  const mod = require("../lib/email") as typeof import("../lib/email");
  // Restore by mutating the existing process.env object rather than
  // reassigning it — reassignment (`process.env = saved`) would swap in a
  // plain object that stores real `undefined`s, masking the coercion bug
  // above for every test after the first.
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, saved);
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
