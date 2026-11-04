import { createJpcEventRequestSchema, updateJpcEventRequestSchema } from "../event";

describe("updateJpcEventRequestSchema under zod 4", () => {
  it("leaves omitted fields absent instead of applying the create defaults", () => {
    expect(updateJpcEventRequestSchema.parse({ title: "Renamed" })).toEqual({ title: "Renamed" });
  });

  it("still fills the create defaults on create", () => {
    const created = createJpcEventRequestSchema.parse({ title: "T", day: "2026-11-20", visibility: "ALL" });
    expect(created).toMatchObject({ time: null, endDay: null, description: null, url: null, seasonId: null });
  });
});
