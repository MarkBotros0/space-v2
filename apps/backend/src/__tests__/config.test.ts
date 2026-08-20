describe("config", () => {
  it("exposes the validated environment", async () => {
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
    process.env.AUTH_SECRET = "test-secret-value";
    process.env.PORT = "4000";
    const { config } = await import("../lib/config");
    expect(config.databaseUrl).toBe("postgresql://user:pass@localhost:5432/db");
    expect(config.authSecret).toBe("test-secret-value");
    expect(config.port).toBe(4000);
  });
});
