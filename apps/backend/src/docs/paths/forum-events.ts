import { conflict, errRef, ok } from "../helpers";
import { idParam, publicIdParam } from "../shared/params";

const partIdParam = {
  name: "partId",
  in: "path",
  required: true,
  schema: { type: "integer" },
  description: "The assignment's FORUM part.",
} as const;

/** Forum and events. Assembled into the document by `../openapi.ts`. */
export const forumEventsPaths = {
  "/api/v1/assignments/{id}/parts/{partId}/forum": {
    get: {
      tags: ["Forum"],
      summary: "The forum thread",
      description:
        "The forum is the assignment's FORUM part (at most one per assignment); its prompt and settings come from the part. Existence first: a missing part, a part that isn't a forum, one named under another assignment, or a deleted assignment is 404 for every caller, then the audience gate (403). The assignment covers the whole season (no group targeting): a STUDENT with a live place in it sees their own response plus their own group's posted responses once they have posted; until then `locked` is true and `posts` is empty — a product mechanic, not an error. LEADER: the groups they lead; ADMIN/SUPER: the season; MENTOR: read-only across the season (a widening of v1, taken so that moderation is possible). An unposted draft is never served. **This read never creates the post** — `PUT .../forum/response` does. No email address or avatar appears anywhere in the payload. Moderation beyond comment deletion does not exist (plan 14 D-14.4).",
      parameters: [
        idParam,
        partIdParam,
        { name: "cursor", in: "query", schema: { type: "string" }, description: "`nextCursor` of the previous page." },
        { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 50, default: 10 } },
      ],
      responses: {
        200: ok({ $ref: "#/components/schemas/ForumView" }, "The thread."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
  },
  "/api/v1/assignments/{id}/parts/{partId}/forum/response": {
    put: {
      tags: ["Forum"],
      summary: "Post (or re-post) the caller's response",
      description:
        "**This PUT creates the post** (ruling C6 forbids a read-time write, so a GET must not): the student's work on the FORUM part, made with the assignment's Submission if missing, written with the body, `status = SUBMITTED` and `submittedAt` together; re-posting overwrites and re-stamps. Posting marks the forum part done (there is no review); it is not Submit. The essay routes answer 404 for a forum post. STUDENT only, with an ACTIVE place in the live season. `text` is plain text and is stored as escaped HTML. The part's `minWords` is applied to the same word count the client shows (400 `too_few_words`), and at least one word is always required. **A late post is allowed on purpose**: a discussion that closes at a deadline stops being a discussion.",
      parameters: [idParam, partIdParam],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: "#/components/schemas/SubmitForumResponseRequest" } } },
      },
      responses: {
        200: ok({ $ref: "#/components/schemas/ForumOwnResponse" }, "The posted response."),
        400: conflict("`bad_request` or `too_few_words`."),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
  },
  "/api/v1/assignments/{id}/parts/{partId}/forum/posts/{publicId}/comments": {
    get: {
      tags: ["Forum"],
      summary: "A post's comments",
      description:
        "Oldest first, numeric cursor. The thread inlines only the first three per post. Same gates as the feed: part 404 first, then the audience (403), then the post must be a real (non-DRAFT) post inside the caller's audience, and a student must have posted their own response (403 `post_first` — a rule, not an error condition). `canDelete` is authoritative; the client must not re-derive it.",
      parameters: [
        idParam,
        partIdParam,
        publicIdParam,
        { name: "cursor", in: "query", schema: { type: "integer", minimum: 1 } },
        { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
      ],
      responses: {
        200: ok({ $ref: "#/components/schemas/ForumCommentsPage" }, "One page of comments."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: conflict("`forbidden` or `post_first`."),
        404: errRef("NotFound"),
      },
    },
    post: {
      tags: ["Forum"],
      summary: "Comment on a post",
      description:
        "Allowed for a student in the post author's group who has posted their own response first (403 `post_first` otherwise), for the LEADER of that group and for the season ADMIN / SUPER without posting anything. A MENTOR stays read-only. The post must belong to the FORUM part in the path (404 otherwise, also when the part is removed while the request is on its way). No notification is sent (`NotificationType` has no forum member). **No moderation beyond comment deletion exists** — there is no way to hide a post or report one (plan 14, D-14.4).",
      parameters: [idParam, partIdParam, publicIdParam],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: "#/components/schemas/AddForumCommentRequest" } } },
      },
      responses: {
        201: ok(
          {
            type: "object",
            required: ["comment"],
            properties: { comment: { $ref: "#/components/schemas/ForumComment" } },
          },
          "The new comment.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: conflict("`forbidden` or `post_first`."),
        404: errRef("NotFound"),
      },
    },
  },
  "/api/v1/forum/comments/{commentId}": {
    delete: {
      tags: ["Forum"],
      summary: "Remove a comment",
      description:
        "The comment's author, SUPER, the season's ADMIN, or the LEADER of the post author's group (new: in v1 the staff power was unreachable from any UI). The post's own author may not remove someone else's comment. Hard delete — there is no `deletedAt` column. The only moderation lever that exists; see plan 14 D-14.4.",
      parameters: [{ name: "commentId", in: "path", required: true, schema: { type: "integer", minimum: 1 } }],
      responses: {
        200: ok(
          { type: "object", required: ["deleted"], properties: { deleted: { type: "boolean", enum: [true] } } },
          "Removed.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
  },
  "/api/v1/events": {
    get: {
      tags: ["Events"],
      summary: "List events",
      description:
        "**Visibility is derived from the token and cannot be widened by a parameter.** ALL: everyone. ALUMNI_ONLY: alumni (a STUDENT with a graduation year) and every non-student role. SEASON: the seasons the caller holds (a student's active season, an admin's seasons, a leader's groups' seasons); a MENTOR holds none, as in v1. SUPER sees everything, orphans included; no other role sees events on a soft-deleted season. The window is on `(endDate ?? date)`; an omitted `from` or `to` leaves that side open, so with neither every visible event is returned (v1 parity). `upcoming=true` starts the window at today's organisation midnight (not combinable with `from`), `limit` (1-20) caps `events`, and `total` is counted before the cap. `allDay`, `dayKey` and `time` are server-derived against the organisation timezone.\n\n**Paging (opt-in).** `paged=true` switches to cursor paging, newest first (date desc, then id desc): `pageSize` rows (1-100, default 25) and `nextCursor`, null on the last page — pass it back as `cursor`. `total` is still the whole window's count. `from`/`to`/`upcoming` combine with it; `limit` does not (400), nor do `cursor`/`pageSize` without `paged=true`. The unpaged form, which the calendars read, is unchanged and carries no `nextCursor`. Event photo endpoints are deliberately absent while uploads are disabled.",
      parameters: [
        { name: "from", in: "query", schema: { type: "string", format: "date-time" } },
        { name: "to", in: "query", schema: { type: "string", format: "date-time" } },
        { name: "upcoming", in: "query", schema: { type: "boolean" } },
        {
          name: "limit",
          in: "query",
          description: "Unpaged only.",
          schema: { type: "integer", minimum: 1, maximum: 20 },
        },
        { name: "paged", in: "query", schema: { type: "boolean" } },
        {
          name: "pageSize",
          in: "query",
          description: "With `paged=true`; default 25.",
          schema: { type: "integer", minimum: 1, maximum: 100 },
        },
        {
          name: "cursor",
          in: "query",
          description: "With `paged=true`: the previous page's `nextCursor`, verbatim (opaque).",
          schema: { type: "string", pattern: "^\\d{1,15}_\\d{1,10}$" },
        },
      ],
      responses: {
        200: ok(
          {
            type: "object",
            required: ["events", "total"],
            properties: {
              events: { type: "array", items: { $ref: "#/components/schemas/JpcEventListItem" } },
              total: { type: "integer", minimum: 0 },
              nextCursor: {
                type: ["string", "null"],
                description: "Present only with `paged=true`; null on the last page.",
              },
            },
          },
          "Unpaged: events ordered by date, then id. Paged: newest first.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
      },
    },
    post: {
      tags: ["Events"],
      summary: "Create an event (SUPER only)",
      description:
        "SUPER only, checked before the body is read; an ADMIN is refused. The server composes the instant in the organisation timezone from `day`/`time`; `time: null` is all-day. The season is nulled unless visibility is SEASON. v1 returns only `{ success: true }`; this returns the detail.",
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: "#/components/schemas/CreateJpcEventRequest" } } },
      },
      responses: {
        201: ok({ $ref: "#/components/schemas/JpcEventDetail" }, "The created event."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
      },
    },
  },
  "/api/v1/events/{id}": {
    get: {
      tags: ["Events"],
      summary: "Event detail",
      description:
        "v1 has no event detail page. The same visibility predicate as the list applies to the row; an event the caller may not see is 404, not 403, so it cannot be told from one that does not exist.",
      parameters: [idParam],
      responses: {
        200: ok({ $ref: "#/components/schemas/JpcEventDetail" }, "The event."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        404: errRef("NotFound"),
      },
    },
    patch: {
      tags: ["Events"],
      summary: "Update an event (SUPER only)",
      description:
        "A true partial, unlike v1 (whose update reuses the create schema). `createdById` is not touched. Visibility leaving SEASON detaches the season.",
      parameters: [idParam],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: "#/components/schemas/UpdateJpcEventRequest" } } },
      },
      responses: {
        200: ok({ $ref: "#/components/schemas/JpcEventDetail" }, "The updated event."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
    delete: {
      tags: ["Events"],
      summary: "Delete an event (SUPER only)",
      description:
        "A hard delete — the model has no `deletedAt`, so a deleted event is unrecoverable. Its stored photo, if any, is left behind exactly as v1 leaves it; the blob lifecycle belongs with the CMS work. A stale id is 404, not a raw database error.",
      parameters: [idParam],
      responses: {
        200: ok(
          { type: "object", required: ["deleted"], properties: { deleted: { type: "boolean", enum: [true] } } },
          "Deleted.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
  },
} as const;
