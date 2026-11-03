/** `{ error: { code, message } }` — every failure in the API uses this shape. */
export const errorResponse = {
  type: "object",
  required: ["error"],
  properties: {
    error: {
      type: "object",
      required: ["code", "message"],
      properties: {
        code: { type: "string", example: "forbidden" },
        message: { type: "string", example: "You don't have access to this." },
      },
    },
  },
} as const;

/** Wrap a schema in the `{ data: ... }` success envelope. */
export function ok(schema: unknown, description: string) {
  return {
    description,
    content: {
      "application/json": {
        schema: {
          type: "object",
          required: ["data"],
          properties: { data: schema },
        },
      },
    },
  };
}

export function errRef(ref: string) {
  return { $ref: `#/components/responses/${ref}` };
}

export function conflict(description: string) {
  return { description, content: { "application/json": { schema: errorResponse } } };
}
