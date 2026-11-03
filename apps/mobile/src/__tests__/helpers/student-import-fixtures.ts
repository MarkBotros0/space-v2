// Sessions, API bodies and steps shared by the student-import*.test.tsx suites.
import { fireEvent, screen } from "@testing-library/react-native";

export const emptyScopes = {
  seasonAdminIds: [] as number[],
  groupLeaderIds: [] as number[],
  activeSeasonId: null as number | null,
  graduationYear: null as number | null,
};
export const superSession = {
  user: {
    id: 1,
    name: "Test super",
    email: "sup@jpc.test",
    role: "SUPER" as const,
    avatarPath: null,
    hasPassword: true,
  },
  scopes: emptyScopes,
};
export const adminSession = {
  user: {
    id: 2,
    name: "Test admin",
    email: "adm@jpc.test",
    role: "ADMIN" as const,
    avatarPath: null,
    hasPassword: true,
  },
  scopes: emptyScopes,
};

export const template = {
  data: {
    data: {
      columns: [
        {
          label: "Name",
          acceptedHeaders: ["name", "student"],
          required: true,
          maxLength: 120,
          target: "User.name",
          note: null,
        },
        {
          label: "Email",
          acceptedHeaders: ["email", "e-mail"],
          required: true,
          maxLength: null,
          target: "User.email",
          note: null,
        },
      ],
      headerRow: "name\temail",
      maxRows: 2000,
      maxPasteChars: 262144,
      capabilities: { pasteText: true, fileUpload: false },
    },
  },
};

// Plan 4's useSeasons parses every row with Plan 3's full seasonListItemSchema.
export const seasons = {
  data: {
    data: {
      seasons: [
        {
          id: 7,
          code: "s-7",
          title: "Spring 2099",
          program: "GBV",
          year: 2099,
          status: "ACTIVE",
          startDate: "2099-01-01T00:00:00.000Z",
          endDate: "2099-06-30T00:00:00.000Z",
        },
      ],
    },
  },
};

/** Season is a v1 select now: open it, then pick the item. */
export async function chooseSeason() {
  fireEvent.press(await screen.findByLabelText("Season"));
  fireEvent.press(await screen.findByText("Spring 2099"));
}

export const previewBody = (overrides: Record<string, unknown> = {}) => ({
  data: {
    data: {
      rows: [
        {
          rowNumber: 2,
          name: "Fresh Student",
          email: "fresh@jpc.test",
          status: "new",
          message: null,
          values: {
            name: "Fresh Student",
            email: "fresh@jpc.test",
            university: null,
            year: null,
            phone: null,
            dateOfBirth: null,
            spiritualBackground: null,
            gifts: null,
            notes: null,
          },
        },
        {
          rowNumber: 3,
          name: "Bad Row",
          email: "nope",
          status: "invalid",
          message: "Email is not valid.",
          values: {
            name: "Bad Row",
            email: "nope",
            university: null,
            year: null,
            phone: null,
            dateOfBirth: null,
            spiritualBackground: null,
            gifts: null,
            notes: null,
          },
        },
      ],
      detectedColumns: ["Name", "Email"],
      unrecognisedColumns: ["Phone No"],
      delimiter: "tab",
      counts: { new: 1, exists: 0, duplicate: 0, invalid: 1, previously_removed: 0, total: 2 },
      ...overrides,
    },
  },
});
