import { auditLog, formatAuditLine } from "../lib/audit";

describe("audit lines (spec 06 D15 — who did what to whom, never a field value)", () => {
  it("formats operation, actor and subject and nothing else", () => {
    expect(formatAuditLine("student.graduate", 3, 41)).toBe("[audit] student.graduate actor=3 subject=41");
  });

  it("writes exactly one info line", () => {
    const info = jest.spyOn(console, "info").mockImplementation(() => undefined);
    auditLog("student.delete", 1, 2);
    expect(info).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith("[audit] student.delete actor=1 subject=2");
    info.mockRestore();
  });
});
