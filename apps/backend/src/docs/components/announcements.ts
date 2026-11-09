/** Announcement schemas. Mirrors `packages/shared/src/announcement.ts`. Assembled by `../openapi.ts`. */
const listItemProps = {
  id: { type: "integer" },
  audience: { type: "string", enum: ["COMMUNITY", "SEASON"] },
  seasonId: { type: ["integer", "null"] },
  seasonTitle: { type: ["string", "null"] },
  authorName: { type: ["string", "null"], description: "Null once the author's account is gone (\"Former member\")." },
  createdAt: { type: "string", format: "date-time" },
  editedAt: { type: ["string", "null"], format: "date-time" },
  isRead: { type: "boolean" },
  hasPoll: { type: "boolean" },
  pollClosed: { type: ["boolean", "null"], description: "Null when the post has no poll." },
} as const;

const pollOptionInput = {
  type: "object",
  required: ["label"],
  additionalProperties: false,
  properties: {
    id: { type: "integer", minimum: 1, description: "On an edit, keeps an existing option and its votes; omit for a new option. Refused on a new post." },
    label: { type: "string", minLength: 1, maxLength: 150, description: "Trimmed; unique ignoring case." },
  },
} as const;

const pollInput = {
  type: "object",
  required: ["allowsMultiple", "options"],
  additionalProperties: false,
  properties: {
    allowsMultiple: { type: "boolean" },
    options: { type: "array", minItems: 2, maxItems: 10, items: pollOptionInput },
  },
} as const;

export const announcementSchemas = {
  AnnouncementListItem: {
    type: "object",
    required: ["id", "audience", "seasonId", "seasonTitle", "excerpt", "authorName", "createdAt", "editedAt", "isRead", "hasPoll", "pollClosed"],
    properties: { ...listItemProps, excerpt: { type: "string", description: "First 280 characters of the body." } },
  },
  AnnouncementDetail: {
    type: "object",
    required: ["id", "audience", "seasonId", "seasonTitle", "authorName", "createdAt", "editedAt", "isRead", "hasPoll", "pollClosed", "body", "canEdit", "canDelete", "seasonFinished", "poll"],
    properties: {
      ...listItemProps,
      body: { type: "string", description: "Plain text, never HTML." },
      canEdit: { type: "boolean" },
      canDelete: { type: "boolean" },
      seasonFinished: { type: "boolean" },
      poll: { oneOf: [{ $ref: "#/components/schemas/AnnouncementPoll" }, { type: "null" }] },
    },
  },
  AnnouncementPoll: {
    type: "object",
    required: ["version", "allowsMultiple", "closed", "canVote", "canManage", "canSeeNames", "myOptionIds", "voterCount", "multiPickVoters", "multiPickVotes", "options"],
    properties: {
      version: { type: "integer", minimum: 1, description: "Bumped when the options change; send it back with a vote." },
      allowsMultiple: { type: "boolean" },
      closed: { type: "boolean" },
      canVote: { type: "boolean" },
      canManage: { type: "boolean" },
      canSeeNames: { type: "boolean", description: "May open who voted for what: managers, and a Super once the season has finished." },
      myOptionIds: { type: "array", items: { type: "integer" } },
      voterCount: { type: ["integer", "null"], description: "Null while the caller may not see counts (before they vote, unless a manager)." },
      multiPickVoters: { type: ["integer", "null"], description: "Managers only: people with more than one pick. Null otherwise." },
      multiPickVotes: { type: ["integer", "null"], description: "Managers only: the vote rows of those people, which a several -> one edit removes. Null otherwise." },
      options: {
        type: "array",
        items: {
          type: "object",
          required: ["id", "label", "votes"],
          properties: { id: { type: "integer" }, label: { type: "string" }, votes: { type: ["integer", "null"] } },
        },
      },
    },
  },
  PollVoteRequest: {
    description: "Replaces the caller's whole vote.",
    type: "object",
    required: ["version", "optionIds"],
    additionalProperties: false,
    properties: {
      version: { type: "integer", minimum: 1, description: "The `version` of the poll the caller saw." },
      optionIds: { type: "array", minItems: 1, items: { type: "integer", minimum: 1 }, description: "Distinct option ids of this poll; one only unless `allowsMultiple`." },
    },
  },
  PollVoters: {
    type: "object",
    required: ["options"],
    properties: {
      options: {
        type: "array",
        items: {
          type: "object",
          required: ["id", "label", "voters"],
          properties: {
            id: { type: "integer" },
            label: { type: "string" },
            voters: {
              type: "array",
              items: {
                type: "object",
                required: ["name"],
                properties: { name: { type: ["string", "null"], description: "Null for a deleted account." } },
              },
            },
          },
        },
      },
    },
  },
  PollVotesLostError: {
    type: "object",
    required: ["error", "votes"],
    properties: {
      error: {
        type: "object",
        required: ["code", "message"],
        properties: { code: { type: "string", const: "poll_votes_lost" }, message: { type: "string" } },
      },
      votes: { type: "integer", minimum: 0, description: "How many votes the edit would remove." },
    },
  },
  AnnouncementPage: {
    type: "object",
    required: ["items", "nextCursor"],
    properties: {
      items: { type: "array", items: { $ref: "#/components/schemas/AnnouncementListItem" } },
      nextCursor: { type: ["string", "null"] },
    },
  },
  AnnouncementUnread: {
    type: "object",
    required: ["count", "latest"],
    properties: {
      count: { type: "integer", minimum: 0 },
      latest: { oneOf: [{ $ref: "#/components/schemas/AnnouncementListItem" }, { type: "null" }] },
    },
  },
  AnnouncementTargets: {
    type: "object",
    required: ["community", "communityReach", "seasons"],
    properties: {
      community: { type: "boolean" },
      communityReach: { type: "integer", minimum: 0 },
      seasons: {
        type: "array",
        items: {
          type: "object",
          required: ["id", "code", "title", "reach"],
          properties: {
            id: { type: "integer" },
            code: { type: "string" },
            title: { type: "string" },
            reach: { type: "integer", minimum: 0 },
          },
        },
      },
    },
  },
  CreateAnnouncementRequest: {
    description: "`body` is trimmed before the length check.",
    oneOf: [
      {
        type: "object",
        required: ["audience", "body"],
        additionalProperties: false,
        properties: {
          audience: { type: "string", const: "COMMUNITY" },
          body: { type: "string", minLength: 1, maxLength: 5000 },
          poll: { ...pollInput, description: "Optional poll; options carry no `id` on a new post." },
        },
      },
      {
        type: "object",
        required: ["audience", "seasonId", "body"],
        additionalProperties: false,
        properties: {
          audience: { type: "string", const: "SEASON" },
          seasonId: { type: "integer", minimum: 1 },
          body: { type: "string", minLength: 1, maxLength: 5000 },
          poll: { ...pollInput, description: "Optional poll; options carry no `id` on a new post." },
        },
      },
    ],
    discriminator: { propertyName: "audience" },
  },
  UpdateAnnouncementRequest: {
    description: "`body` is trimmed before the length check.",
    type: "object",
    required: ["body"],
    additionalProperties: false,
    properties: {
      body: { type: "string", minLength: 1, maxLength: 5000 },
      poll: { oneOf: [pollInput, { type: "null" }], description: "Absent leaves the poll alone; null removes it (and its votes); an object replaces its options (options with an `id` are kept)." },
      confirmVoteLoss: { type: "boolean", description: "Must be true for a poll edit that would remove votes; otherwise 409 `poll_votes_lost`." },
    },
  },
} as const;
