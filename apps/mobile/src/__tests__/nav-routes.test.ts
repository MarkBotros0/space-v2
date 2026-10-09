import { ALL_NAV_HREFS, navByRole, navFor } from "@space/shared";

import { moreItemsFor, navHref } from "../lib/nav-routes";

describe("navHref", () => {
  it("resolves every nav href to a typed route", () => {
    // NAV_ROUTES is hand-listed so each value is compile-checked as an Href;
    // this keeps the list complete as navigation.ts grows.
    expect(ALL_NAV_HREFS.filter((href) => navHref(href) === null)).toEqual([]);
  });

  it("refuses anything that is not a nav href", () => {
    expect(navHref("/nope")).toBeNull();
    expect(navHref("constructor")).toBeNull();
  });
});

describe("moreItemsFor", () => {
  it("is the sidebar minus the tabs, in sidebar order (v1 extraItemsFor)", () => {
    expect(moreItemsFor(navByRole.STUDENT).map((i) => i.label)).toEqual([
      "Current Season", "Attendance", "History", "Profile", "Notifications", "Settings",
    ]);
    expect(moreItemsFor(navByRole.ADMIN).map((i) => i.label)).toEqual([
      "My Season", "Assignments", "Quizzes", "Reports", "Notifications", "Settings",
    ]);
    expect(moreItemsFor(navFor({ role: "STUDENT", graduationYear: 2024 })).map((i) => i.label)).toEqual([
      "Notifications", "Settings",
    ]);
  });
});
