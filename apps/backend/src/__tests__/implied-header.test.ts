import { withImpliedHeader } from "../lib/imports/students/implied-header";

// Owner 2026-11-07: students in bulk with only a name and an email, no header row.
describe("withImpliedHeader", () => {
  it("supplies name,email in front of plain name, email lines", () => {
    const out = withImpliedHeader("Mina Adel, mina@jpc.test\nSara Nabil, sara@jpc.test");
    expect(out.implied).toBe(true);
    expect(out.text.split("\n")[0]).toBe("name,email");
  });

  it("follows the order and the delimiter of the first line", () => {
    const out = withImpliedHeader("mina@jpc.test\tMina Adel");
    expect(out).toEqual({ text: "email\tname\nmina@jpc.test\tMina Adel", implied: true });
  });

  it("leaves a real header row alone", () => {
    const text = "name,email\nMina,mina@jpc.test";
    expect(withImpliedHeader(text)).toEqual({ text, implied: false });
  });

  it.each([
    ["more than two cells", "Mina,mina@jpc.test,Cairo"],
    ["no email", "Mina,Adel"],
    ["two emails", "a@jpc.test,b@jpc.test"],
    ["an empty name", ",mina@jpc.test"],
    ["nothing", "  \n "],
  ])("leaves %s alone", (_label, text) => {
    expect(withImpliedHeader(text).implied).toBe(false);
  });
});
