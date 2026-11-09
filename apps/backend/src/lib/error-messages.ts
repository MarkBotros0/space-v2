/**
 * Canned messages for refusals sent from more than one place. The texts differ
 * by route on purpose for now (unifying them is open question Q22); naming
 * them stops a third spelling appearing.
 */

/** `email_taken` from the users routes (POST /users, PATCH /users/:id). */
export const EMAIL_IN_USE = "Email already in use.";

/** `email_taken` from the students routes (create, edit, profile). */
export const EMAIL_EXISTS = "A user with that email already exists.";
