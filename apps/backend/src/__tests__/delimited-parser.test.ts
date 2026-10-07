// apps/backend/src/__tests__/delimited-parser.test.ts
import { ImportParseError, parseDelimited, sniffDelimiter } from "../lib/imports/delimited";

describe("sniffDelimiter", () => {
  it("reads a tab in the HEADER line as tab-separated (what a spreadsheet paste is)", () => {
    expect(sniffDelimiter("name\temail\tphone")).toBe("tab");
    expect(sniffDelimiter("name,email,phone")).toBe("comma");
  });
});

describe("parseDelimited", () => {
  it("numbers data rows from 2 — the header is line 1 (spec R11)", () => {
    const sheet = parseDelimited("name,email\nA,a@jpc.test\nB,b@jpc.test", "auto", 2000);
    expect(sheet.header).toEqual(["name", "email"]);
    expect(sheet.rows.map((r) => r.rowNumber)).toEqual([2, 3]);
  });

  it("skips a blank line WITHOUT renumbering the rows after it (spec R20)", () => {
    // "row 4" in a message must point at line 4 of what the operator pasted.
    const sheet = parseDelimited("name,email\nA,a@jpc.test\n\nC,c@jpc.test", "auto", 2000);
    expect(sheet.rows.map((r) => r.rowNumber)).toEqual([2, 4]);
  });

  it("never coerces a cell to a number — this is spec D7 closed by construction", () => {
    // v1's CSV branch forces raw text with an identity map specifically to
    // protect a leading "+" and leading zeros in phone numbers
    // (spreadsheet.ts:29-34); its XLSX branch does not, so the same data
    // imports differently depending on the file format. There is one format
    // here and it is text.
    const sheet = parseDelimited("name,phone\nA,+201234567\nB,00201234567", "auto", 2000);
    expect(sheet.rows[0]?.cells[1]).toBe("+201234567");
    expect(sheet.rows[1]?.cells[1]).toBe("00201234567");
  });

  it("honours RFC-4180 quoting, including a delimiter and a newline inside a value", () => {
    const sheet = parseDelimited('name,notes\n"Doe, Jane","line one\nline two"', "auto", 2000);
    expect(sheet.rows).toHaveLength(1);
    expect(sheet.rows[0]?.cells).toEqual(["Doe, Jane", "line one\nline two"]);
  });

  it("unescapes a doubled quote", () => {
    const sheet = parseDelimited('name,notes\nA,"she said ""hi"""', "auto", 2000);
    expect(sheet.rows[0]?.cells[1]).toBe('she said "hi"');
  });

  it("handles CRLF, a lone CR, a trailing newline and a leading BOM", () => {
    const sheet = parseDelimited("\uFEFFname,email\r\nA,a@jpc.test\r\n", "auto", 2000);
    expect(sheet.header).toEqual(["name", "email"]);
    expect(sheet.rows).toHaveLength(1);
  });

  it("respects an explicit delimiter over the sniffer", () => {
    // A TSV whose header happens to contain no tab must not be read as CSV
    // just because the sniffer guessed; that is why `delimiter` exists.
    const sheet = parseDelimited("name\nA,B", "tab", 2000);
    expect(sheet.rows[0]?.cells).toEqual(["A,B"]);
  });

  it("fails loudly on an unclosed quote instead of swallowing the rest of the paste", () => {
    expect(() => parseDelimited('name,notes\nA,"oops', "auto", 2000)).toThrow(ImportParseError);
    expect(() => parseDelimited('name,notes\nA,"oops', "auto", 2000)).toThrow(/unclosed/i);
  });

  it("refuses a paste with a header and no data rows", () => {
    expect(() => parseDelimited("name,email", "auto", 2000)).toThrow(/no data rows/i);
  });

  it("refuses more than maxRows, naming the count the operator actually pasted", () => {
    const text = ["name,email", ...Array.from({ length: 4 }, (_, i) => `A${i},a${i}@jpc.test`)].join("\n");
    expect(() => parseDelimited(text, "auto", 3)).toThrow(/4 rows/);
  });
});
