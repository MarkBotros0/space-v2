import { studentSchemas } from "./students";

/** Auth, seasons, groups, users and students schemas. Assembled into the document by `../openapi.ts`. */
export const peopleSchemas = {
  Session: {
    type: "object",
    description: "An issued token pair.",
    required: ["accessToken", "expiresIn", "refreshToken"],
    properties: {
      accessToken: { type: "string" },
      expiresIn: { type: "integer", example: 900, description: "Seconds until the access token expires." },
      refreshToken: { type: "string", description: "Opaque; rotated on every refresh." },
    },
  },
  AuthUser: {
    type: "object",
    required: ["id", "name", "email", "role"],
    properties: {
      id: { type: "integer" },
      name: { type: "string" },
      email: { type: "string", format: "email" },
      role: { $ref: "#/components/schemas/UserRole" },
    },
  },

  SeasonListItem: {
    type: "object",
    properties: {
      id: { type: "integer" },
      code: { type: "string", example: "gbv-2026" },
      title: { type: "string" },
      program: { type: "string", example: "GBV" },
      year: { type: "integer" },
      status: { $ref: "#/components/schemas/SeasonStatus" },
      isCommunityWide: { type: "boolean", description: "Anyone may take part as a student, alumni too." },
      startDate: { type: "string", format: "date-time" },
      endDate: { type: "string", format: "date-time" },
    },
  },
  SeasonDetail: {
    type: "object",
    properties: {
      id: { type: "integer" },
      code: { type: "string" },
      title: { type: "string" },
      program: { type: "string" },
      requiredProgram: {
        type: ["string", "null"],
        description:
          "The program someone must have finished to join. Sent to SUPER and this season's admins and leaders; left out for everyone else.",
      },
      graduatesOnPass: {
        type: "boolean",
        description: "Passing this season makes an alumnus. Sent as `requiredProgram` is; left out for everyone else.",
      },
      isCommunityWide: {
        type: "boolean",
        description:
          "Anyone may take part as a student, alumni too; the season has no required program and graduates nobody.",
      },
      year: { type: "integer" },
      description: { type: ["string", "null"] },
      status: { $ref: "#/components/schemas/SeasonStatus" },
      startDate: { type: "string", format: "date-time" },
      endDate: { type: "string", format: "date-time" },
      sessionCount: { type: "integer" },
      studentCount: { type: "integer", description: "Enrolments in the season, leaving out withdrawn students." },
      absenceBudgetMinutes: { type: "integer" },
      absenceWeightMinutes: { type: "integer" },
      canAdminister: { type: "boolean", description: "isAdminOfSeason for the caller (C4)." },
      groups: {
        type: "array",
        description: "A STUDENT sees only their own group here.",
        items: {
          type: "object",
          properties: {
            id: { type: "integer" },
            name: { type: "string" },
            studentCount: { type: "integer" },
            leaderNames: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
  },

  SeasonRosterRow: {
    type: "object",
    properties: {
      userId: { type: "integer" },
      name: { type: ["string", "null"] },
      email: { type: "string" },
      groupId: { type: ["integer", "null"], description: "This season's group, from SeasonEnrollment.groupId (C9)." },
      groupName: { type: ["string", "null"] },
    },
  },
  GroupAssignmentsRequest: {
    type: "object",
    required: ["assignments"],
    properties: {
      assignments: {
        type: "array",
        maxItems: 500,
        items: {
          type: "object",
          required: ["studentUserId", "groupId"],
          properties: {
            studentUserId: { type: "integer" },
            groupId: { type: ["integer", "null"], description: "null unassigns from this season's group." },
          },
        },
      },
    },
  },
  GroupListItem: {
    type: "object",
    properties: {
      id: { type: "integer" },
      name: { type: "string" },
      description: { type: ["string", "null"] },
      studentCount: {
        type: "integer",
        description: "ACTIVE season enrolments naming this group (SeasonEnrollment is the authority, ruling C9).",
      },
      leaderNames: { type: "array", items: { type: "string" } },
      seasonId: { type: "integer" },
      seasonCode: { type: "string" },
      seasonTitle: { type: "string" },
    },
  },
  SeasonWriteRequest: {
    type: "object",
    required: ["program", "year", "startDate", "endDate", "status"],
    properties: {
      code: {
        type: "string",
        description:
          "Slugified server-side (v1 rules); defaults to '<program> <year>'. The slug must be 2–40 chars of a-z, 0-9 and inner dashes.",
      },
      program: { type: "string", minLength: 1, maxLength: 60 },
      requiredProgram: {
        type: ["string", "null"],
        maxLength: 60,
        description:
          "A program a student must have passed to join. SUPER only, and changeable only while the season is a draft (else 409 `season_not_draft`); omitted leaves it as it is, null clears it. Can't equal `program` (400, \"A season can't require its own program.\").",
      },
      graduatesOnPass: {
        type: "boolean",
        description:
          "Everyone who passes becomes an alumnus when the season ends. SUPER only (a season admin's PATCH gets 403 `forbidden_field`), and changeable until the season has finished (else 409 `season_finished`); omitted leaves it as it is, default false.",
      },
      isCommunityWide: {
        type: "boolean",
        description:
          "Anyone may study, alumni too. SUPER only (a season admin's PATCH gets 403 `forbidden_field`), changeable only while the season is a draft (else 409 `season_started`, \"This season has started, so this can't change.\"); omitted leaves it as it is, default false. Together with `graduatesOnPass` or a `requiredProgram`: 409 `community_wide_rules`.",
      },
      year: { type: "integer", minimum: 2000, maximum: 2100 },
      description: { type: ["string", "null"], maxLength: 2000 },
      startDate: { type: "string", format: "date-time" },
      endDate: { type: "string", format: "date-time" },
      status: { type: "string", enum: ["DRAFT", "ACTIVE", "COMPLETED", "ARCHIVED"] },
      absenceBudgetMinutes: { type: "integer", minimum: 1, default: 180 },
      absenceWeightMinutes: { type: "integer", minimum: 1, default: 90 },
    },
  },
  GroupWriteRequest: {
    type: "object",
    required: ["name"],
    description:
      "v1's schema covered name and description only — leaderIds and studentIds were read straight off the raw body with no eligibility check. Since a GroupLeader row populates the groupLeaderIds claim, an unvalidated leader list is a privilege path rather than a data-quality problem. On PATCH an absent key leaves that field alone; `description: null` clears it.",
    properties: {
      name: { type: "string", minLength: 2, maxLength: 80 },
      description: { type: ["string", "null"], maxLength: 2000 },
      leaderIds: {
        type: "array",
        maxItems: 20,
        items: { type: "integer" },
        description:
          "Replaces the current set on POST and, when sent, on PATCH. Everyone being added must be a live alumnus with no other active role and no other group in this season (409 `not_alumnus`, `already_in_role`, `leader_has_group`, ...; 404 `not_found` for no such user); a leader who stays is not re-checked. Whoever is added or removed refreshes into the new role, still signed in.",
      },
      studentIds: {
        type: "array",
        maxItems: 500,
        items: { type: "integer" },
        description:
          "Must all be on the season's roster: a WITHDRAWN member or one who is no longer a student is 409 `not_enrolled`. Replaces the current roster; a student dropped from the list keeps their enrolment and loses only the group pointer.",
      },
    },
  },
  GroupMember: {
    type: "object",
    required: ["id", "name"],
    properties: {
      id: { type: "integer" },
      name: { type: ["string", "null"] },
      email: {
        type: "string",
        format: "email",
        description:
          "Omitted entirely for a STUDENT caller. A student may read their own group, but v1 only ever put this payload on staff pages — showing every member of a group each other's address is not a change this API makes.",
      },
    },
  },
  GroupDetail: {
    type: "object",
    properties: {
      id: { type: "integer" },
      name: { type: "string" },
      description: { type: ["string", "null"] },
      seasonId: { type: "integer" },
      seasonCode: { type: "string" },
      seasonTitle: { type: "string" },
      leaders: { type: "array", items: { $ref: "#/components/schemas/GroupMember" } },
      students: { type: "array", items: { $ref: "#/components/schemas/GroupMember" } },
      canManage: { type: "boolean", description: "isAdminOfSeason for the caller." },
    },
  },

  InviteState: {
    type: "object",
    required: ["issuedAt", "expiresAt", "usedAt", "invitedByName"],
    description: "Invite metadata. There is no token field, ever: the code travels in the invite email only.",
    properties: {
      issuedAt: { type: "string", format: "date-time" },
      expiresAt: { type: "string", format: "date-time" },
      usedAt: { type: ["string", "null"], format: "date-time" },
      invitedByName: { type: ["string", "null"] },
    },
  },

  UserListItem: {
    type: "object",
    required: ["id", "name", "email", "role", "graduationYear", "lastLoginAt", "deletedAt", "status"],
    properties: {
      id: { type: "integer" },
      name: { type: "string" },
      email: { type: "string", format: "email" },
      role: { $ref: "#/components/schemas/UserRole" },
      graduationYear: { type: ["integer", "null"] },
      lastLoginAt: { type: ["string", "null"], format: "date-time" },
      deletedAt: { type: ["string", "null"], format: "date-time" },
      status: {
        type: "string",
        enum: ["active", "invited", "pending", "inactive"],
        description:
          "Derived server-side: inactive (soft-deleted) > active (has a password or has logged in) > invited (live unaccepted invite) > pending.",
      },
    },
  },

  UserDetail: {
    allOf: [
      { $ref: "#/components/schemas/UserListItem" },
      {
        type: "object",
        required: ["invite", "adminSeasons"],
        properties: {
          invite: { oneOf: [{ $ref: "#/components/schemas/InviteState" }, { type: "null" }] },
          adminSeasons: {
            type: "array",
            description:
              "Non-deleted seasons the user is a SeasonAdmin of. A role change away from ADMIN deletes these assignments.",
            items: {
              type: "object",
              required: ["id", "code", "title"],
              properties: { id: { type: "integer" }, code: { type: "string" }, title: { type: "string" } },
            },
          },
        },
      },
    ],
  },

  ...studentSchemas,
} as const;
