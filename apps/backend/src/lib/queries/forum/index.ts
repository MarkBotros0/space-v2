/**
 * Forum reads (refactor BE-015: split from one 310-line module). `shared` holds
 * the display-name rule, the part loader and the audience check, `feed`
 * the forum view, `comments` one post's comments. Import from this index.
 */
export { displayNameFor, loadForumPart, ownForumWork, postInAudience, type ForumPartRow } from "./shared";
export { loadForumView } from "./feed";
export { FORUM_COMMENT_SELECT, listForumComments, toForumComment } from "./comments";
