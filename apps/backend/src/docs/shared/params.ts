export const idParam = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "integer", minimum: 1 },
} as const;

export const questionIdParam = {
  name: "questionId",
  in: "path",
  required: true,
  schema: { type: "integer", minimum: 1 },
} as const;

export const publicIdParam = {
  name: "publicId",
  in: "path",
  required: true,
  description: "Opaque 10-character submission identifier — not numeric.",
  schema: { type: "string" },
} as const;
