/** News (announcement) schemas. Mirrors `packages/shared/src/announcement.ts`. Assembled by `../openapi.ts`. */
const listItemProps = {
  id: { type: "integer" },
  audience: { type: "string", enum: ["COMMUNITY", "SEASON"] },
  seasonId: { type: ["integer", "null"] },
  seasonTitle: { type: ["string", "null"] },
  title: { type: "string" },
  authorName: { type: ["string", "null"], description: "Null once the author's account is gone (\"Former member\")." },
  createdAt: { type: "string", format: "date-time" },
  editedAt: { type: ["string", "null"], format: "date-time" },
  isRead: { type: "boolean" },
} as const;

export const announcementSchemas = {
  AnnouncementListItem: {
    type: "object",
    required: ["id", "audience", "seasonId", "seasonTitle", "title", "excerpt", "authorName", "createdAt", "editedAt", "isRead"],
    properties: { ...listItemProps, excerpt: { type: "string", description: "First 280 characters of the body." } },
  },
  AnnouncementDetail: {
    type: "object",
    required: ["id", "audience", "seasonId", "seasonTitle", "title", "authorName", "createdAt", "editedAt", "isRead", "body", "canEdit", "canDelete", "seasonFinished"],
    properties: {
      ...listItemProps,
      body: { type: "string", description: "Plain text, never HTML." },
      canEdit: { type: "boolean" },
      canDelete: { type: "boolean" },
      seasonFinished: { type: "boolean" },
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
    oneOf: [
      {
        type: "object",
        required: ["audience", "title", "body"],
        additionalProperties: false,
        properties: {
          audience: { type: "string", const: "COMMUNITY" },
          title: { type: "string", minLength: 1, maxLength: 120 },
          body: { type: "string", minLength: 1, maxLength: 5000 },
        },
      },
      {
        type: "object",
        required: ["audience", "seasonId", "title", "body"],
        additionalProperties: false,
        properties: {
          audience: { type: "string", const: "SEASON" },
          seasonId: { type: "integer", minimum: 1 },
          title: { type: "string", minLength: 1, maxLength: 120 },
          body: { type: "string", minLength: 1, maxLength: 5000 },
        },
      },
    ],
    discriminator: { propertyName: "audience" },
  },
  UpdateAnnouncementRequest: {
    type: "object",
    minProperties: 1,
    additionalProperties: false,
    properties: {
      title: { type: "string", minLength: 1, maxLength: 120 },
      body: { type: "string", minLength: 1, maxLength: 5000 },
    },
  },
} as const;
