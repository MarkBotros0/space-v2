import { conflict, errRef, ok } from "../helpers";
import { idParam } from "../shared/params";

const detail = { $ref: "#/components/schemas/AnnouncementDetail" } as const;

/** Announcements. Assembled into the document by `../openapi.ts`. */
export const announcementPaths = {
  "/api/v1/announcements": {
    get: {
      tags: ["Announcements"],
      summary: "The announcements feed",
      description:
        "Newest first, 20 per page, cursor paged. Everyone signed in sees COMMUNITY posts; a SEASON post is visible to that season's people and to SUPER. MENTOR sees community posts only. Each item carries `isRead` for the caller. An unknown or malformed `cursor` is 400.",
      parameters: [{ name: "cursor", in: "query", schema: { type: "string" }, description: "`nextCursor` of the previous page." }],
      responses: {
        200: ok({ $ref: "#/components/schemas/AnnouncementPage" }, "One page of posts."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
      },
    },
    post: {
      tags: ["Announcements"],
      summary: "Publish a post",
      description:
        "Optional `poll` (2 to 10 options, each 1 to 150 characters, unique ignoring case). Audience COMMUNITY (SUPER) or SEASON with a `seasonId` (that season's admin, or SUPER). The season must be ACTIVE: a draft is 409 `season_draft`, a finished one 409 `season_finished`; an unknown season is 404. Body 1 to 5000 characters after trimming (a post has no title), plain text only (never HTML); unknown fields are rejected with 400. Notifies the audience (type `ANNOUNCEMENT`, titled \"New announcement\", link `/announcements/<id>`), never the author.",
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: "#/components/schemas/CreateAnnouncementRequest" } } },
      },
      responses: {
        201: ok(detail, "The new post."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict("`season_draft` or `season_finished`."),
      },
    },
  },
  "/api/v1/announcements/unread": {
    get: {
      tags: ["Announcements"],
      summary: "Unread count and the latest unread post",
      description:
        "Posts the caller can see, from the last 30 days and newer than the caller's account, that they have not marked read. The caller's own posts never count, and season posts count only for a season the caller is live in; for SUPER, only community posts count. `latest` is null when `count` is 0.",
      responses: {
        200: ok({ $ref: "#/components/schemas/AnnouncementUnread" }, "The unread summary."),
        401: errRef("Unauthorized"),
      },
    },
  },
  "/api/v1/announcements/targets": {
    get: {
      tags: ["Announcements"],
      summary: "Where the caller may post",
      description:
        "`community` is true for SUPER only; `seasons` lists the ACTIVE seasons the caller administers (SUPER: all ACTIVE ones). `reach` counts the people a post would notify, the author excluded. Empty for anyone who cannot post.",
      responses: {
        200: ok({ $ref: "#/components/schemas/AnnouncementTargets" }, "The caller's targets."),
        401: errRef("Unauthorized"),
      },
    },
  },
  "/api/v1/announcements/{id}": {
    get: {
      tags: ["Announcements"],
      summary: "A post",
      description:
        "A post the caller may not read is 404, never 403. `canEdit`, `canDelete` and `seasonFinished` are authoritative; the client must not re-derive them.",
      parameters: [idParam],
      responses: {
        200: ok(detail, "The post."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        404: errRef("NotFound"),
      },
    },
    patch: {
      tags: ["Announcements"],
      summary: "Edit a post",
      description:
        "The new body, same limit as publishing; the audience never changes. `poll` absent leaves the poll alone, null removes it, an object edits it (options with an `id` keep their votes); an edit that would remove votes needs `confirmVoteLoss: true` or answers 409 `poll_votes_lost` with `votes`. Invalid options are 400. Stamps `editedAt`. Only SUPER, or the post's author while they still administer its season, may edit. Nobody may edit a finished season's post: 409 `season_finished`, checked before the permission.",
      parameters: [idParam],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: "#/components/schemas/UpdateAnnouncementRequest" } } },
      },
      responses: {
        200: ok(detail, "The edited post."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: {
          description: "`season_finished`, or `poll_votes_lost`: the poll edit would remove votes and `confirmVoteLoss` was not true.",
          content: {
            "application/json": {
              schema: { oneOf: [{ $ref: "#/components/schemas/Error" }, { $ref: "#/components/schemas/PollVotesLostError" }] },
            },
          },
        },
      },
    },
    delete: {
      tags: ["Announcements"],
      summary: "Delete a post",
      description: "Same rule as edit (SUPER, or the author while they still administer the season), except that SUPER may also delete a finished season's post. `canDelete` on the detail is authoritative. Returns 204 with no body (not the envelope).",
      parameters: [idParam],
      responses: {
        204: { description: "Deleted." },
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
  },
  "/api/v1/announcements/{id}/read": {
    post: {
      tags: ["Announcements"],
      summary: "Mark a post read",
      description: "Idempotent; marking twice is still 204 with no body. A post the caller cannot see is 404.",
      parameters: [idParam],
      responses: {
        204: { description: "Marked read." },
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        404: errRef("NotFound"),
      },
    },
  },
  "/api/v1/announcements/{id}/poll/vote": {
    put: {
      tags: ["Announcements"],
      summary: "Vote in a poll",
      description:
        "Replaces the caller's whole vote and answers the post with its fresh poll. A post the caller may not read, or without a poll, is 404. `version` must match the poll's current version (409 `poll_changed` otherwise: reload and vote again). A closed poll is 409 `poll_closed`, a finished season 409 `season_finished`. Unknown, duplicate or too many `optionIds`, or a malformed body, is 400. Callers who may not vote (for example the author) get 403.",
      parameters: [idParam],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: "#/components/schemas/PollVoteRequest" } } },
      },
      responses: {
        200: ok(detail, "The post with the updated poll."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict("`poll_closed`, `poll_changed` or `season_finished`."),
      },
    },
  },
  "/api/v1/announcements/{id}/poll/close": {
    post: {
      tags: ["Announcements"],
      summary: "Close a poll",
      description:
        "Idempotent. Only the poll's managers (`poll.canManage`) may close it; a post the caller cannot read or without a poll is 404. A finished season is 409 `season_finished`. Answers the post.",
      parameters: [idParam],
      responses: {
        200: ok(detail, "The post with the closed poll."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict("`season_finished`."),
      },
    },
  },
  "/api/v1/announcements/{id}/poll/reopen": {
    post: {
      tags: ["Announcements"],
      summary: "Reopen a poll",
      description: "Idempotent; same access and errors as close. Answers the post.",
      parameters: [idParam],
      responses: {
        200: ok(detail, "The post with the reopened poll."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict("`season_finished`."),
      },
    },
  },
  "/api/v1/announcements/{id}/poll/voters": {
    get: {
      tags: ["Announcements"],
      summary: "Who voted for what",
      description:
        "Names per option, in option order. Only the poll's managers (and SUPER once the season has finished) may read it; for anyone else, or a post without a poll, it is 404, never 403. A deleted account reads `name: null`.",
      parameters: [idParam],
      responses: {
        200: ok({ $ref: "#/components/schemas/PollVoters" }, "Voters per option."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        404: errRef("NotFound"),
      },
    },
  },
} as const;
