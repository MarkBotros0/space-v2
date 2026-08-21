/** Load config under a specific environment, isolated from the ambient one. */
function loadConfig(env: Record<string, string | undefined>) {
  jest.resetModules();
  const saved = { ...process.env };
  for (const key of Object.keys(process.env)) delete process.env[key];
  // config.ts does `import "dotenv/config"`, which would repopulate the very
  // keys this helper just cleared from the developer's real .env — pointing
  // dotenv at a path that does not exist keeps each case hermetic.
  process.env.DOTENV_CONFIG_PATH = "/nonexistent/.env";
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) process.env[key] = value;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require("../lib/config") as { config: Record<string, unknown> }).config;
  } finally {
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, saved);
  }
}

const REQUIRED = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  AUTH_SECRET: "test-secret-value",
};

describe("config", () => {
  it("exposes the validated environment", () => {
    const config = loadConfig({ ...REQUIRED, PORT: "4000" });
    expect(config.databaseUrl).toBe(REQUIRED.DATABASE_URL);
    expect(config.authSecret).toBe(REQUIRED.AUTH_SECRET);
    expect(config.port).toBe(4000);
  });

  it("treats an empty string as unset so defaults still apply", () => {
    // Hosting platforms materialise a declared-but-unset variable as "" rather
    // than omitting it. Without the empty-strip, every one of these fails
    // validation despite having a default, and the real problem (a missing
    // DATABASE_URL) gets buried among them.
    const config = loadConfig({
      ...REQUIRED,
      PORT: "",
      STORAGE_DRIVER: "",
      MAX_UPLOAD_BYTES: "",
      ENABLE_API_DOCS: "",
      ENABLE_UPLOADS: "",
      TRUST_PROXY: "",
      MOBILE_APP_ORIGIN: "",
    });

    expect(config.port).toBe(4000);
    expect(config.storageDriver).toBe("local");
    expect(config.maxUploadBytes).toBe(26214400);
    expect(config.enableApiDocs).toBe(true);
    expect(config.enableUploads).toBe(false);
    expect(config.trustProxy).toBe(0);
    expect(config.mobileAppOrigin).toBe("*");
  });

  it("treats an empty optional as absent rather than a blank value", () => {
    // An empty GMAIL_USER must leave email unconfigured, not configure it with
    // an empty sender — sendNotificationEmail keys off these being undefined.
    const config = loadConfig({ ...REQUIRED, GMAIL_USER: "", GMAIL_APP_PASSWORD: "", AUTH_URL: "" });
    expect(config.gmailUser).toBeUndefined();
    expect(config.gmailAppPassword).toBeUndefined();
    expect(config.authUrl).toBeUndefined();
  });

  it("still rejects a missing DATABASE_URL, naming it and nothing else", () => {
    expect(() => loadConfig({ AUTH_SECRET: REQUIRED.AUTH_SECRET })).toThrow(/DATABASE_URL/);
    // The keys that have defaults must not appear in the failure.
    expect(() => loadConfig({ AUTH_SECRET: REQUIRED.AUTH_SECRET })).not.toThrow(/STORAGE_DRIVER/);
  });

  it("rejects an empty DATABASE_URL the same as a missing one", () => {
    expect(() => loadConfig({ ...REQUIRED, DATABASE_URL: "" })).toThrow(/DATABASE_URL/);
  });
});
