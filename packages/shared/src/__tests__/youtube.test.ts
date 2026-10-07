import { parseYouTubeId } from "../index";

const ID = "dQw4w9WgXcQ"; // 11 chars, the canonical shape

describe("parseYouTubeId — forms v1 accepted, kept", () => {
  it.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com/watch?v=${ID}&t=42`,
    `https://www.youtube.com/watch?list=PLxyz&v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?t=42`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube.com/shorts/${ID}`,
  ])("accepts %s", (url) => {
    expect(parseYouTubeId(url)).toBe(ID);
  });
});

describe("parseYouTubeId — forms v1 silently rejected, now accepted (spec 13 D7a)", () => {
  it.each([
    [`https://www.youtube.com/live/${ID}`, "a premiere or streamed session"],
    [`https://www.youtube.com/v/${ID}`, "the legacy embed"],
    [ID, "a bare id pasted from the YouTube UI"],
    [`youtube.com/watch?v=${ID}`, "no scheme"],
  ])("accepts %s (%s)", (url) => {
    expect(parseYouTubeId(url)).toBe(ID);
  });
});

describe("parseYouTubeId — the two holes v1 left open", () => {
  it("refuses a non-YouTube host (v1 R33 had no host check at all)", () => {
    // v1's /embed/ regex scanned the raw string, so this parsed successfully
    // and handed its 'id' to the YouTube player: a wrong video, silently.
    expect(parseYouTubeId(`https://example.com/embed/${ID}`)).toBeNull();
    expect(parseYouTubeId(`https://youtube.com.evil.test/watch?v=${ID}`)).toBeNull();
  });

  it("refuses an over-long id instead of truncating it (v1 R34)", () => {
    // v1 returned the first 11 characters of a 12-character token — a
    // valid-looking, wrong id rather than a failure.
    expect(parseYouTubeId(`https://www.youtube.com/watch?v=${ID}X`)).toBeNull();
    expect(parseYouTubeId(`https://youtu.be/${ID}X`)).toBeNull();
  });

  it("returns null for anything else", () => {
    expect(parseYouTubeId("")).toBeNull();
    expect(parseYouTubeId("   ")).toBeNull();
    expect(parseYouTubeId("https://www.youtube.com/playlist?list=PLxyz")).toBeNull();
    expect(parseYouTubeId("https://vimeo.com/12345678")).toBeNull();
    expect(parseYouTubeId("not a url")).toBeNull();
  });
});
