import {
  createJpcEventRequestSchema,
  eventListQuerySchema,
  jpcEventPageResponseSchema,
  updateJpcEventRequestSchema,
} from "../event";

describe("updateJpcEventRequestSchema under zod 4", () => {
  it("leaves omitted fields absent instead of applying the create defaults", () => {
    expect(updateJpcEventRequestSchema.parse({ title: "Renamed" })).toEqual({ title: "Renamed" });
  });

  it("still fills the create defaults on create", () => {
    const created = createJpcEventRequestSchema.parse({ title: "T", day: "2026-11-20", visibility: "ALL" });
    expect(created).toMatchObject({ time: null, endDay: null, description: null, url: null, seasonId: null });
  });
});

describe("eventListQuerySchema paging (opt-in)", () => {
  it("is unpaged by default", () => {
    expect(eventListQuerySchema.parse({})).toMatchObject({ paged: false, upcoming: false });
  });

  it("accepts paged with a cursor, a pageSize and the window filters", () => {
    expect(
      eventListQuerySchema.parse({ paged: "true", pageSize: "10", cursor: "4070908800000_12", upcoming: "true" }),
    ).toMatchObject({ paged: true, pageSize: 10, cursor: "4070908800000_12", upcoming: true });
  });

  it.each([
    [{ cursor: "1_2" }],
    [{ pageSize: "5" }],
    [{ paged: "true", limit: "5" }],
    [{ paged: "true", cursor: "12" }],
    [{ paged: "true", cursor: "a_b" }],
    [{ paged: "true", pageSize: "0" }],
  ])("refuses %j", (query) => {
    expect(eventListQuerySchema.safeParse(query).success).toBe(false);
  });

  it("the page response requires nextCursor (null on the last page)", () => {
    expect(jpcEventPageResponseSchema.safeParse({ events: [], total: 0, nextCursor: null }).success).toBe(true);
    expect(jpcEventPageResponseSchema.safeParse({ events: [], total: 0 }).success).toBe(false);
  });
});
