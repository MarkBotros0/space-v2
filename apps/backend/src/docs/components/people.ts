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
      year: { type: "integer" },
      description: { type: ["string", "null"] },
      status: { $ref: "#/components/schemas/SeasonStatus" },
      startDate: { type: "string", format: "date-time" },
      endDate: { type: "string", format: "date-time" },
      sessionCount: { type: "integer" },
      studentCount: { type: "integer" },
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
        description:
          "ACTIVE season enrolments naming this group (SeasonEnrollment is the authority, ruling C9).",
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
      code: { type: "string", description: "Slugified server-side (v1 rules); defaults to '<program> <year>'. The slug must be 2–40 chars of a-z, 0-9 and inner dashes." },
      program: { type: "string", minLength: 1, maxLength: 60 },
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
      "v1's schema covered name and description only — leaderIds and studentIds were read straight off the raw body with no eligibility check. Since a GroupLeader row populates the groupLeaderIds claim, an unvalidated leader list is a privilege path rather than a data-quality problem.",
    properties: {
      name: { type: "string", minLength: 2, maxLength: 80 },
      description: { type: ["string", "null"], maxLength: 2000 },
      leaderIds: {
        type: "array",
        maxItems: 20,
        items: { type: "integer" },
        description: "Must all be users with the LEADER role. Replaces the current set.",
      },
      studentIds: {
        type: "array",
        maxItems: 500,
        items: { type: "integer" },
        description:
          "Must all already be enrolled in the season. Replaces the current roster; a student dropped from the list keeps their enrolment and loses only the group pointer.",
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
        description: "Derived server-side: inactive (soft-deleted) > active (has a password or has logged in) > invited (live unaccepted invite) > pending.",
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

  StudentListItem: {
    type: "object",
    required: ["id", "name", "email", "avatarPath", "university", "year", "graduationYear", "activeSeasonTitle", "currentGroupName", "droppedEnrollment"],
    properties: {
      id: { type: "integer" },
      name: { type: "string" },
      email: { type: "string" },
      avatarPath: { type: ["string", "null"] },
      university: { type: ["string", "null"] },
      year: { type: ["string", "null"] },
      graduationYear: { type: ["integer", "null"] },
      activeSeasonTitle: { type: ["string", "null"] },
      currentGroupName: { type: ["string", "null"], description: "Advisory: the most recent GroupStudent membership, any season (C9)." },
      droppedEnrollment: {
        description: "Non-null only on `status=dropped` rows, which are enrollment-keyed — key rows on `enrollmentId`, not the user id.",
        oneOf: [
          {
            type: "object",
            properties: {
              enrollmentId: { type: "integer" },
              seasonId: { type: "integer" },
              seasonTitle: { type: "string" },
              droppedAt: { type: ["string", "null"], format: "date-time" },
              dropReason: { type: ["string", "null"] },
            },
          },
          { type: "null" },
        ],
      },
    },
  },

  EnrollmentHistoryItem: {
    type: "object",
    properties: {
      enrollmentId: { type: "integer" },
      seasonId: { type: "integer" },
      seasonCode: { type: "string" },
      seasonTitle: { type: "string" },
      seasonStatus: { $ref: "#/components/schemas/SeasonStatus" },
      startDate: { type: "string", format: "date-time" },
      endDate: { type: "string", format: "date-time" },
      groupName: { type: ["string", "null"], description: "The historic group for that season, from SeasonEnrollment.groupId (C9)." },
      status: { type: "string", enum: ["ACTIVE", "COMPLETED", "WITHDRAWN"] },
      enrolledAt: { type: "string", format: "date-time" },
      completedAt: { type: ["string", "null"], format: "date-time" },
      droppedAt: { type: ["string", "null"], format: "date-time" },
      dropReason: { type: ["string", "null"], description: "Always null for MENTOR and LEADER." },
      attendancePct: {
        type: ["integer", "null"],
        description:
          "Whole-number % of the season's past sessions (from the student's own enrolment date) marked PRESENT or LATE — the engagement formula, any enrolment status (REG-83). Staff only: null in the student's own view and for a season outside the caller's scope (an ADMIN's other seasons, a LEADER's other groups).",
      },
    },
  },
  StudentAttendanceHistoryItem: {
    type: "object",
    properties: {
      sessionId: { type: "integer" },
      sessionTitle: { type: "string" },
      startsAt: { type: "string", format: "date-time" },
      seasonId: { type: "integer" },
      seasonTitle: { type: "string" },
      status: { type: "string", enum: ["PRESENT", "ABSENT", "LATE"] },
    },
  },
  StudentSubmissionItem: {
    type: "object",
    properties: {
      publicId: { type: "string" },
      assignmentId: { type: "integer" },
      assignmentTitle: { type: "string" },
      status: { $ref: "#/components/schemas/SubmissionStatus" },
      isLate: { type: "boolean" },
      submittedAt: { type: ["string", "null"], format: "date-time" },
      reviewedAt: { type: ["string", "null"], format: "date-time" },
      seasonId: { type: "integer" },
      seasonTitle: { type: "string" },
    },
  },
  StudentDetail: {
    type: "object",
    description:
      "Three role-shaped payloads share this envelope; only `profile` differs. **Fields withheld from a role are absent from the wire, not null.** `public` (MENTOR, LEADER): university, year, gifts, activeSeasonId/Title/Code. `private` (the student themselves): public + phone, dateOfBirth, spiritualBackground. `internal` (SUPER, ADMIN): private + notes. The subject never receives `notes`.",
    properties: {
      id: { type: "integer" },
      name: { type: "string" },
      email: { type: "string" },
      avatarPath: { type: ["string", "null"] },
      graduationYear: { type: ["integer", "null"] },
      currentGroup: {
        description: "Advisory current group: the most recent GroupStudent membership, any season.",
        oneOf: [{ type: "object", properties: { id: { type: "integer" }, name: { type: "string" } } }, { type: "null" }],
      },
      enrollments: { type: "array", items: { $ref: "#/components/schemas/EnrollmentHistoryItem" }, description: "`enrolledAt` descending. For a LEADER only the rows naming one of their groups." },
      profile: {
        type: "object",
        properties: {
          university: { type: ["string", "null"] },
          year: { type: ["string", "null"] },
          gifts: { type: ["string", "null"] },
          activeSeasonId: { type: ["integer", "null"] },
          activeSeasonTitle: { type: ["string", "null"] },
          activeSeasonCode: { type: ["string", "null"] },
          phone: { type: ["string", "null"], description: "private and internal shapes only." },
          dateOfBirth: { type: ["string", "null"], format: "date-time", description: "private and internal shapes only." },
          spiritualBackground: { type: ["string", "null"], description: "private and internal shapes only." },
          notes: { type: ["string", "null"], description: "internal shape only (SUPER, ADMIN)." },
        },
      },
    },
  },

} as const;
