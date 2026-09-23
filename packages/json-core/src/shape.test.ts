import { describe, expect, it } from "vitest";
import { inferShape, type TypeShape } from "./shape";
import { parseJson } from "./validate";

function shapeOf(input: string): TypeShape {
  const result = parseJson(input);
  if (!result.ok) throw new Error(result.error.message);
  return inferShape(result.value);
}

describe("inferShape", () => {
  it("records primitives", () => {
    expect([...shapeOf('"x"').primitives]).toEqual(["string"]);
    expect([...shapeOf("null").primitives]).toEqual(["null"]);
  });

  it("merges array items and counts how often each key appears", () => {
    const shape = shapeOf('[{"id":1,"email":"a"},{"id":2,"email":null},{"id":3}]');
    const item = shape.array!.item!;
    expect(item.object!.samples).toBe(3);
    expect(Object.fromEntries(item.object!.counts)).toEqual({ id: 3, email: 2 });
    expect([...item.object!.fields.get("email")!.primitives].sort()).toEqual(["null", "string"]);
  });

  it("keeps empty arrays as having no item shape", () => {
    expect(shapeOf("[]").array).toEqual({ item: null });
    expect(shapeOf('[[],[1]]').array!.item!.array!.item!.primitives).toEqual(new Set(["number"]));
  });

  it("mixes kinds in one array", () => {
    const item = shapeOf('[1,"a",{"x":true},[null]]').array!.item!;
    expect([...item.primitives].sort()).toEqual(["number", "string"]);
    expect(item.object).not.toBeNull();
    expect(item.array!.item!.primitives).toEqual(new Set(["null"]));
  });

  it("uses the last duplicate key", () => {
    expect([...shapeOf('{"a":1,"a":"x"}').object!.fields.get("a")!.primitives]).toEqual(["string"]);
  });
});
