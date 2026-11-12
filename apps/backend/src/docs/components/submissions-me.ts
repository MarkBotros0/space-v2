/** Submissions and `/me` schemas. Assembled into the document by `../openapi.ts`. */
export const submissionsMeSchemas = {
  SubmissionFile: {
    type: "object",
    properties: {
      id: { type: "integer" },
      originalName: { type: "string" },
      mimeType: { type: "string" },
      sizeBytes: { type: "integer" },
    },
    description:
      "`storagePath` is deliberately absent. v1's client needed it to build a URL into the endpoint that served any stored file to any logged-in user; here a file is addressed by id scoped to its essay, so the path is the one field that made the old hole exploitable by anyone who saw a response.",
  },
  SubmissionDetail: {
    type: "object",
    description: "One student's essay: the essay work, its part's question and limits, and its assignment.",
    properties: {
      id: { type: "integer" },
      publicId: { type: "string", description: "The essay work's." },
      status: { $ref: "#/components/schemas/SubmissionStatus" },
      text: {
        type: ["string", "null"],
        description: "Plain text: stored HTML is converted on read (ruling C11, REG-90).",
      },
      wordCount: {
        type: "integer",
        description: "Words of the plain text (`essayWordCount`), as the hand-in checks them.",
      },
      partId: { type: "integer" },
      prompt: { type: "string", description: "The essay's question." },
      minWords: { type: ["integer", "null"] },
      maxWords: { type: ["integer", "null"] },
      maxFileSizeMb: { type: ["integer", "null"], description: "Null: this essay takes no files." },
      allowedMimeCategories: { type: "array", items: { type: "string" }, description: "Empty: any type." },
      feedback: { type: ["string", "null"], description: "Plain text, as `text`." },
      submittedAt: { type: ["string", "null"], format: "date-time" },
      reviewedAt: { type: ["string", "null"], format: "date-time" },
      isLate: {
        type: "boolean",
        description:
          "submittedAt is after the assignment's dueAt. Derived server-side once; v1 recomputed this comparison at five separate render sites.",
      },
      assignmentId: { type: "integer" },
      assignmentTitle: { type: "string" },
      assignmentDueAt: { type: ["string", "null"], format: "date-time" },
      dueOrgDay: {
        type: ["string", "null"],
        format: "date",
        description: "Organisation-calendar day of the assignment's due date (ORG_TIMEZONE); null with no due date.",
      },
      dueOrgTime: {
        type: ["string", "null"],
        description: "Organisation wall-clock time (HH:mm) of the due date; null with no due date.",
      },
      assignmentDescription: { type: ["string", "null"] },
      seasonCode: { type: "string" },
      studentUserId: { type: "integer" },
      studentName: { type: ["string", "null"] },
      studentEmail: { type: "string", format: "email" },
      groupId: {
        type: ["integer", "null"],
        description: "The student's group in this assignment's season, from their enrolment (ruling C9).",
      },
      groupName: { type: ["string", "null"] },
      files: { type: "array", items: { $ref: "#/components/schemas/SubmissionFile" } },
      canUploadFiles: {
        type: "boolean",
        description:
          "Whether an upload would currently succeed: the essay takes files and ENABLE_UPLOADS is on, so a screen can explain the gap rather than offering a control that is refused. Reading and deleting recorded files are unaffected.",
      },
      canReview: {
        type: "boolean",
        description:
          "Whether this caller may review. Drives what the UI offers, never the gate. False for the author and for a MENTOR, both of whom can read.",
      },
    },
  },
  SubmissionQueueItem: {
    type: "object",
    description: "A reviewer's queue row: one essay of one student. Deliberately narrower than the detail.",
    properties: {
      publicId: { type: "string", description: "The essay work's: the review screen's handle." },
      assignmentId: { type: "integer" },
      assignmentTitle: { type: "string" },
      prompt: { type: "string", description: "The essay's question." },
      studentName: { type: ["string", "null"] },
      submittedAt: { type: ["string", "null"], format: "date-time", description: "When the essay was handed in." },
      isLate: { type: "boolean", description: "Handed in after the assignment's due date." },
      reviewStatus: { $ref: "#/components/schemas/SubmissionStatus" },
      reviewedAt: {
        type: ["string", "null"],
        format: "date-time",
        description: "When the essay was last reviewed or returned; null before any verdict.",
      },
    },
  },
  SubmissionQueue: {
    type: "object",
    properties: {
      items: { type: "array", items: { $ref: "#/components/schemas/SubmissionQueueItem" } },
      counts: {
        type: ["object", "null"],
        description:
          "v1's header numbers over everything the caller's scope (and `seasonId`) reaches, ignoring `pendingOnly` and paging. DRAFTs never count. Sent on the first page only; null on a page requested with `cursor`, since the header reads the first page's.",
        properties: {
          pending: { type: "integer", description: "Essays handed in, awaiting a verdict." },
          total: { type: "integer", description: "Every handed-in essay in scope (a draft never counts)." },
          late: { type: "integer", description: "Essays handed in after the assignment's due date." },
        },
      },
      nextCursor: {
        type: ["string", "null"],
        description: "Pass as `cursor` for the next page. Null on the last page.",
      },
    },
  },
  SeasonHistoryRow: {
    type: "object",
    additionalProperties: false,
    description:
      "A past enrollment — attendance %, curriculum and outcome ONLY (spec 02 R34: no submissions, feedback, notes or reasons, by design).",
    properties: {
      seasonId: { type: "integer" },
      code: { type: "string" },
      outcome: { type: "string", enum: ["PASSED", "NOT_PASSED", "COMPLETED", "DROPPED"] },
      title: { type: "string" },
      startDate: { type: "string", format: "date-time" },
      endDate: { type: "string", format: "date-time" },
      groupName: { type: ["string", "null"] },
      attendancePct: { type: "integer", minimum: 0, maximum: 100 },
      curriculum: {
        type: "array",
        items: {
          type: "object",
          properties: {
            sessionId: { type: "integer" },
            title: { type: "string" },
            startsAt: { type: "string", format: "date-time" },
            dayKey: {
              type: "string",
              pattern: "^\\d{4}-\\d{2}-\\d{2}$",
              description: "Org-calendar day (ruling X13).",
            },
          },
        },
      },
    },
  },
  SeasonRecord: {
    type: "object",
    additionalProperties: false,
    description: "One past season in full, read-only. Never carries result or drop reasons, feedback or notes.",
    properties: {
      season: {
        type: "object",
        properties: {
          id: { type: "integer" },
          code: { type: "string" },
          title: { type: "string" },
          startDate: { type: "string", format: "date-time" },
          endDate: { type: "string", format: "date-time" },
        },
      },
      outcome: { type: "string", enum: ["PASSED", "NOT_PASSED", "COMPLETED", "DROPPED"] },
      groupName: { type: ["string", "null"] },
      attendancePct: { type: "integer", minimum: 0, maximum: 100 },
      assignments: { type: "array", items: { type: "object", description: "Student assignment list item." } },
      quizzes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "integer" },
            title: { type: "string" },
            kind: { type: "string", enum: ["PAPER", "ONLINE"] },
            status: { type: "string", enum: ["NOT_TAKEN", "IN_PROGRESS", "SUBMITTED", "GRADED"] },
            score: {
              type: ["number", "null"],
              description:
                "The score that counts, decimal to 2 places: the admin's score when there is one. Null until graded.",
            },
            adminScore: {
              oneOf: [{ $ref: "#/components/schemas/QuizAdminScore" }, { type: "null" }],
              description:
                "ONLINE only: the season admin's score and note, labelled as theirs. Null for PAPER and when none.",
            },
          },
        },
      },
      attendance: {
        type: "array",
        items: {
          type: "object",
          properties: {
            sessionId: { type: "integer" },
            title: { type: "string" },
            startsAt: { type: "string", format: "date-time" },
            status: { type: ["string", "null"], enum: ["PRESENT", "ABSENT", "LATE", null] },
          },
        },
      },
    },
  },
  MySeason: {
    type: "object",
    properties: {
      id: { type: "integer" },
      code: { type: "string" },
      title: { type: "string" },
      description: { type: ["string", "null"] },
      status: { $ref: "#/components/schemas/SeasonStatus" },
      startDate: { type: "string", format: "date-time" },
      endDate: { type: "string", format: "date-time" },
      progress: {
        type: "object",
        description: "Session-based (R29): completed = startsAt <= now.",
        properties: {
          completedSessions: { type: "integer" },
          totalSessions: { type: "integer" },
          pct: { type: "integer", minimum: 0, maximum: 100 },
        },
      },
      group: {
        type: ["object", "null"],
        description: "From this season's SeasonEnrollment (ruling C9). Leaders carry email; peers never do (R89).",
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          description: { type: ["string", "null"] },
          leaders: {
            type: "array",
            items: {
              type: "object",
              properties: { id: { type: "integer" }, name: { type: "string" }, email: { type: "string" } },
            },
          },
          members: {
            type: "array",
            items: {
              type: "object",
              properties: { id: { type: "integer" }, name: { type: "string" }, isYou: { type: "boolean" } },
            },
          },
        },
      },
      upcoming: {
        type: "array",
        maxItems: 3,
        items: {
          type: "object",
          properties: {
            id: { type: "integer" },
            title: { type: "string" },
            startsAt: { type: "string", format: "date-time" },
            dayKey: { type: "string" },
            location: { type: ["string", "null"] },
          },
        },
      },
    },
  },
  MyProfile: {
    type: "object",
    additionalProperties: false,
    description: "The caller's own profile. Never carries staff-only notes (spec 06 R23).",
    properties: {
      name: { type: "string" },
      email: { type: "string" },
      avatarPath: { type: ["string", "null"] },
      graduationYear: {
        type: ["integer", "null"],
        description:
          "Non-null = alumnus; the profile is then read-only, unless they are studying in a community-wide season (then it is edited like a student's).",
      },
      activeSeasonTitle: { type: ["string", "null"] },
      university: { type: ["string", "null"] },
      faculty: { type: ["string", "null"] },
      universityGraduationYear: {
        type: ["integer", "null"],
        minimum: 1950,
        maximum: 2100,
        description: "University graduation year; may be in the future. Not the JPCS graduationYear.",
      },
      phone: { type: ["string", "null"], description: "Account-level (User)." },
      dateOfBirth: {
        type: ["string", "null"],
        pattern: "^\\d{4}-\\d{2}-\\d{2}$",
        description: "A calendar date. Account-level (User).",
      },
    },
  },
  MyAttendance: {
    type: "object",
    properties: {
      season: {
        type: ["object", "null"],
        properties: {
          id: { type: "integer" },
          title: { type: "string" },
          absenceBudgetMinutes: { type: "integer" },
          absenceWeightMinutes: { type: "integer" },
        },
      },
      budget: {
        type: ["object", "null"],
        properties: {
          minutesUsed: { type: "integer" },
          budgetMinutes: { type: "integer" },
          budgetPct: { type: "integer", minimum: 0, maximum: 100 },
          remainingPct: {
            type: "integer",
            minimum: 0,
            maximum: 100,
            description: "max(0, 100 − budgetPct) — 'Absence budget left' (spec 19 D14).",
          },
          absentCount: { type: "integer" },
          lateCount: { type: "integer" },
        },
      },
      streak: {
        type: "integer",
        minimum: 0,
        description: "Consecutive attended past sessions; ABSENT breaks it, unmarked is skipped.",
      },
      sessions: {
        type: "array",
        description: "Past sessions, newest first.",
        items: {
          type: "object",
          properties: {
            sessionId: { type: "integer" },
            title: { type: "string" },
            startsAt: { type: "string", format: "date-time" },
            dayKey: { type: "string" },
            startTime: { type: "string", description: "Org-clock start, HH:mm (X13)." },
            status: { oneOf: [{ $ref: "#/components/schemas/AttendanceStatus" }, { type: "null" }] },
            checkedInAt: { type: ["string", "null"], format: "date-time" },
            lateMinutes: { type: ["integer", "null"] },
            costMinutes: { type: ["integer", "null"] },
          },
        },
      },
    },
  },
} as const;
