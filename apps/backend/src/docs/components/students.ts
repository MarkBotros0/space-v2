/** Student list, history and detail schemas; spread into `peopleSchemas` (./people.ts). */
export const studentSchemas = {
  StudentListItem: {
    type: "object",
    required: [
      "id",
      "name",
      "email",
      "avatarPath",
      "university",
      "faculty",
      "universityGraduationYear",
      "graduationYear",
      "activeSeasonTitle",
      "currentGroupName",
      "droppedEnrollment",
    ],
    properties: {
      id: { type: "integer" },
      name: { type: "string" },
      email: { type: "string" },
      avatarPath: { type: ["string", "null"] },
      university: { type: ["string", "null"] },
      faculty: { type: ["string", "null"] },
      universityGraduationYear: {
        type: ["integer", "null"],
        minimum: 1950,
        maximum: 2100,
        description: "University graduation year; may be in the future. Not the JPCS graduationYear.",
      },
      graduationYear: { type: ["integer", "null"] },
      activeSeasonTitle: { type: ["string", "null"] },
      lastSeasonTitle: {
        type: ["string", "null"],
        description:
          "With no active season, the latest finished season they completed (the active and alumni lists only).",
      },
      currentGroupName: {
        type: ["string", "null"],
        description: "Advisory: the most recent GroupStudent membership, any season (C9).",
      },
      droppedEnrollment: {
        description:
          "Non-null only on `status=dropped` rows, which are enrollment-keyed — key rows on `enrollmentId`, not the user id.",
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
      groupName: {
        type: ["string", "null"],
        description: "The historic group for that season, from SeasonEnrollment.groupId (C9).",
      },
      status: { type: "string", enum: ["ACTIVE", "COMPLETED", "WITHDRAWN"] },
      enrolledAt: { type: "string", format: "date-time" },
      completedAt: { type: ["string", "null"], format: "date-time" },
      droppedAt: { type: ["string", "null"], format: "date-time" },
      dropReason: {
        type: ["string", "null"],
        description: "Null unless the row is WITHDRAWN. Always null for MENTOR and LEADER.",
      },
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
      "Three role-shaped payloads share this envelope; only `profile` differs. **Fields withheld from a role are absent from the wire, not null.** `public` (MENTOR, LEADER): university, faculty, universityGraduationYear, activeSeasonId/Title/Code. `private` (the student themselves): public + phone, dateOfBirth (both read from the User row). `internal` (SUPER, ADMIN): private + notes. The subject never receives `notes`.",
    properties: {
      id: { type: "integer" },
      name: { type: "string" },
      email: { type: "string" },
      avatarPath: { type: ["string", "null"] },
      graduationYear: { type: ["integer", "null"] },
      graduatedByException: {
        type: ["object", "null"],
        description:
          "SUPER's view only (null when none, absent for everyone else): the person was graduated without passing a graduating season. `at` is the time, `byName` the super who did it, `reason` their reason.",
        properties: {
          at: { type: "string", format: "date-time" },
          byName: { type: ["string", "null"] },
          reason: { type: ["string", "null"] },
        },
      },
      invite: {
        type: ["object", "null"],
        description:
          "The internal view only (absent for everyone else): null once the account is set up; else `status` `invited` while the newest invite still works (until `expiresAt`), `pending` when none does. Resend with `POST /students/{id}/invite`.",
        properties: {
          status: { type: "string", enum: ["invited", "pending"] },
          expiresAt: { type: ["string", "null"], format: "date-time" },
        },
      },
      currentGroup: {
        description: "Advisory current group: the most recent GroupStudent membership, any season.",
        oneOf: [
          { type: "object", properties: { id: { type: "integer" }, name: { type: "string" } } },
          { type: "null" },
        ],
      },
      enrollments: {
        type: "array",
        items: { $ref: "#/components/schemas/EnrollmentHistoryItem" },
        description: "`enrolledAt` descending. For a LEADER only the rows naming one of their groups.",
      },
      profile: {
        type: "object",
        properties: {
          university: { type: ["string", "null"] },
          faculty: { type: ["string", "null"] },
          universityGraduationYear: {
            type: ["integer", "null"],
            minimum: 1950,
            maximum: 2100,
            description: "University graduation year; may be in the future. Not the JPCS graduationYear.",
          },
          activeSeasonId: { type: ["integer", "null"] },
          activeSeasonTitle: { type: ["string", "null"] },
          activeSeasonCode: { type: ["string", "null"] },
          phone: { type: ["string", "null"], description: "private and internal shapes only." },
          dateOfBirth: {
            type: ["string", "null"],
            format: "date-time",
            description: "private and internal shapes only.",
          },
          notes: { type: ["string", "null"], description: "internal shape only (SUPER, ADMIN)." },
        },
      },
    },
  },
} as const;
