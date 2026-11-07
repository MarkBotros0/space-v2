import { auditLog, formatAuditLine } from "../lib/audit";

describe("audit lines (spec 06 D15 — who did what to whom, never a field value)", () => {
  it("formats operation, actor and subject and nothing else", () => {
    expect(formatAuditLine("student.graduate", 3, 41)).toBe("[audit] student.graduate actor=3 subject=41");
    expect(formatAuditLine("student.graduate", 3, 41, { override: true })).toBe(
      "[audit] student.graduate actor=3 subject=41 override=true",
    );
  });

  it("writes exactly one info line", () => {
    const info = jest.spyOn(console, "info").mockImplementation(() => undefined);
    auditLog("student.delete", 1, 2);
    expect(info).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith("[audit] student.delete actor=1 subject=2");
    info.mockRestore();
  });

  it("appends a season scope id after the subject", () => {
    expect(formatAuditLine("season.admin_add", 1, 7, { season: 4 })).toBe(
      "[audit] season.admin_add actor=1 subject=7 season=4",
    );
  });
});
