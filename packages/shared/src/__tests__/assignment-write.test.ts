import {
  DEFAULT_DUE_TIME,
  assignmentDeletedResponseSchema,
  assignmentDetailSchema,
  assignmentWriteRequestSchema,
  createAssignmentRequestSchema,
  isoDaySchema,
  updateAssignmentRequestSchema,
  wallTimeSchema,
} from "../index";

const valid = {
  title: "Week 4 reflection",
  isAllGroups: true,
};

describe("isoDaySchema / wallTimeSchema (org wall clock on the wire, ruling C2)", () => {
  it("accepts a real calendar day and refuses shapes and impossible days", () => {
    expect(isoDaySchema.safeParse("2099-04-01").success).toBe(true);
    expect(isoDaySchema.safeParse("2099-4-1").success).toBe(false);
    expect(isoDaySchema.safeParse("2099-02-31").success).toBe(false);
    expect(isoDaySchema.safeParse("2099-04-01T00:00:00Z").success).toBe(false);
  });

  it("accepts 24-hour HH:mm only", () => {
    expect(wallTimeSchema.safeParse("23:59").success).toBe(true);
    expect(wallTimeSchema.safeParse("00:00").success).toBe(true);
    expect(wallTimeSchema.safeParse("24:00").success).toBe(false);
    expect(wallTimeSchema.safeParse("9:05").success).toBe(false);
  });
});

describe("assignmentWriteRequestSchema", () => {
  it("is the one body for create and update — seasonId is never part of it (R68)", () => {
    expect(createAssignmentRequestSchema).toBe(assignmentWriteRequestSchema);
    expect(updateAssignmentRequestSchema).toBe(assignmentWriteRequestSchema);
    const parsed = assignmentWriteRequestSchema.parse({ ...valid, seasonId: 99 });
    expect(parsed).not.toHaveProperty("seasonId");
  });

  it("applies v1's defaults (R5, R7, R9) and nulls what was not sent", () => {
    expect(assignmentWriteRequestSchema.parse(valid)).toEqual({
      title: "Week 4 reflection",
      description: null,
      dueDay: null,
      dueTime: null,
      sessionId: null,
      type: "STANDARD",
      forumMinWords: null,
      forumAllowComments: false,
      maxFileSizeMb: null,
      allowedMimeCategories: [],
      isAllGroups: true,
      groupIds: [],
    });
  });

  it("defaults a picked day's time to 23:59 (R19) and drops the time when there is no day", () => {
    expect(assignmentWriteRequestSchema.parse({ ...valid, dueDay: "2099-04-01" }).dueTime).toBe(
      DEFAULT_DUE_TIME,
    );
    expect(
      assignmentWriteRequestSchema.parse({ ...valid, dueDay: null, dueTime: "18:00" }).dueTime,
    ).toBeNull();
  });

  it("no longer accepts a device-composed instant: dueAt is not a field (C2)", () => {
    const parsed = assignmentWriteRequestSchema.parse({ ...valid, dueAt: "2099-04-01T21:59:00Z" });
    expect(parsed).not.toHaveProperty("dueAt");
    expect(parsed.dueDay).toBeNull();
  });

  it("bounds title at the server truth, 2–160 (R1, R18)", () => {
    expect(assignmentWriteRequestSchema.safeParse({ ...valid, title: "x" }).success).toBe(false);
    expect(assignmentWriteRequestSchema.safeParse({ ...valid, title: "x".repeat(161) }).success).toBe(
      false,
    );
  });

  it("FORUM keeps forum config and drops file config (R14, R15)", () => {
    const parsed = assignmentWriteRequestSchema.parse({
      ...valid,
      type: "FORUM",
      forumMinWords: 120,
      forumAllowComments: true,
      maxFileSizeMb: 20,
      allowedMimeCategories: ["pdf"],
    });
    expect(parsed).toMatchObject({
      forumMinWords: 120,
      forumAllowComments: true,
      maxFileSizeMb: null,
      allowedMimeCategories: [],
    });
  });

  it("STANDARD keeps file config and drops forum config (R16)", () => {
    const parsed = assignmentWriteRequestSchema.parse({
      ...valid,
      forumMinWords: 50,
      forumAllowComments: true,
      maxFileSizeMb: 10,
      allowedMimeCategories: ["image", "pdf"],
    });
    expect(parsed).toMatchObject({
      forumMinWords: null,
      forumAllowComments: false,
      maxFileSizeMb: 10,
      allowedMimeCategories: ["image", "pdf"],
    });
  });

  // v1 parity 2026-10-09 (was "refuses … deliberate divergence from R13"): v1
  // assignment-actions.ts:73 saves it, targeting nobody.
  it("accepts 'specific groups' with none chosen, as v1 (R13)", () => {
    const result = assignmentWriteRequestSchema.parse({ ...valid, isAllGroups: false });
    expect(result.isAllGroups).toBe(false);
    expect(result.groupIds).toEqual([]);
  });

  it("collapses duplicate group ids (closes R70) and drops them when targeting everyone (R24)", () => {
    expect(
      assignmentWriteRequestSchema.parse({ ...valid, isAllGroups: false, groupIds: [4, 4, 3] }).groupIds,
    ).toEqual([4, 3]);
    expect(assignmentWriteRequestSchema.parse({ ...valid, groupIds: [4] }).groupIds).toEqual([]);
  });
});

describe("response additions", () => {
  const detail = {
    id: 41, seasonId: 7, seasonCode: "s7", seasonTitle: "Spring 2099",
    sessionId: null, sessionTitle: null, title: "Essay one", description: null,
    dueAt: "2099-04-01T21:59:00.000Z", dueOrgDay: "2099-04-01", dueOrgTime: "23:59",
    isOverdue: false, isAllGroups: true, type: "STANDARD", forumMinWords: null,
    forumAllowComments: false, maxFileSizeMb: null, allowedMimeCategories: [],
    groupIds: [], mySubmission: null, canManage: true,
  };

  it("requires the server-derived org due fields on the detail (C4)", () => {
    expect(assignmentDetailSchema.safeParse(detail).success).toBe(true);
    const { dueOrgDay: _day, ...missing } = detail;
    expect(assignmentDetailSchema.safeParse(missing).success).toBe(false);
  });

  it("parses the delete response", () => {
    expect(assignmentDeletedResponseSchema.parse({ deleted: true })).toEqual({ deleted: true });
    expect(assignmentDeletedResponseSchema.safeParse({ deleted: false }).success).toBe(false);
  });
});
