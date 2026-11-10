/**
 * Forum reads (refactor BE-015: split from one 310-line module). `shared` holds
 * the display-name rule, the assignment loader and the audience check, `feed`
 * the forum view, `comments` one post's comments. Import from this index.
 */
export { displayNameFor, loadForumAssignment, postInAudience } from "./shared";
export { loadForumView } from "./feed";
export { listForumComments } from "./comments";
