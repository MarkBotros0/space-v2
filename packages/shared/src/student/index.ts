// The student domain's wire contracts, split by concern.
//
// Wire shapes — timestamps travel as ISO strings (see the note in season.ts).
//
// `name` is `z.string()`, non-nullable, everywhere in this domain: User.name is
// `String` in the schema (prisma/schema.prisma:106). The `string | null` in
// every v1 student type is D9's defect and does not port; nor do the
// `name ?? email` render fallbacks it forced.

export * from "./list";
export * from "./detail";
export * from "./writes";
export * from "./lifecycle";
export * from "./profile";
