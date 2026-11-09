import { act, renderHook } from "@testing-library/react-native";
import { z } from "zod";

import { useSchemaErrors } from "../lib/form-errors";

const schema = z.object({ title: z.string().min(1, "Enter a title.") });

describe("useSchemaErrors", () => {
  it("sets the first error per field and answers false, then clears on a valid body", () => {
    const { result } = renderHook(() => useSchemaErrors(schema));
    let ok = true;
    act(() => {
      ok = result.current.validate({ title: "" });
    });
    expect(ok).toBe(false);
    expect(result.current.errors).toEqual({ title: "Enter a title." });
    act(() => {
      ok = result.current.validate({ title: "Week 1" });
    });
    expect(ok).toBe(true);
    expect(result.current.errors).toEqual({});
  });
});
