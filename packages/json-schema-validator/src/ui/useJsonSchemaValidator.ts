import type { Result } from "@web-kit/json-core";
import { useDeferredValue, useMemo, useState } from "react";
import { inferSchema } from "../core/infer";
import type { SchemaResult } from "../core/types";
import { validateSchema } from "../core/validate";

export interface UseJsonSchemaValidatorOptions {
  initialData?: string;
  initialSchema?: string;
}

export interface UseJsonSchemaValidator {
  data: string;
  setData: (value: string) => void;
  schema: string;
  /** Also forgets the schema that "Generate schema from data" replaced. */
  setSchema: (value: string) => void;
  /** null while either input is empty. */
  result: SchemaResult | null;
  /** False while the result still describes older text: its offsets may not match the inputs. */
  fresh: boolean;
  /** Replaces the schema with one inferred from the data; returns the error when the data is not valid JSON. */
  generate: () => Result<string>;
  /** The schema that the last generate replaced; null when there is nothing to undo. */
  previousSchema: string | null;
  undoGenerate: () => void;
}

/** Headless state for checking JSON data against a JSON Schema. */
export function useJsonSchemaValidator(options: UseJsonSchemaValidatorOptions = {}): UseJsonSchemaValidator {
  const [data, setData] = useState(options.initialData ?? "");
  const [schema, setSchemaText] = useState(options.initialSchema ?? "");
  const [previousSchema, setPreviousSchema] = useState<string | null>(null);
  // Validating large documents is slower than typing; let the result follow the text.
  const deferredData = useDeferredValue(data);
  const deferredSchema = useDeferredValue(schema);

  const result = useMemo(
    (): SchemaResult | null =>
      deferredData.trim() === "" || deferredSchema.trim() === "" ? null : validateSchema(deferredData, deferredSchema),
    [deferredData, deferredSchema],
  );

  function setSchema(value: string): void {
    setPreviousSchema(null);
    setSchemaText(value);
  }

  function generate(): Result<string> {
    const inferred = inferSchema(data);
    if (inferred.ok) {
      setPreviousSchema(schema.trim() === "" ? null : schema);
      setSchemaText(inferred.value);
    }
    return inferred;
  }

  function undoGenerate(): void {
    if (previousSchema === null) return;
    setSchemaText(previousSchema);
    setPreviousSchema(null);
  }

  return {
    data,
    setData,
    schema,
    setSchema,
    result,
    fresh: deferredData === data && deferredSchema === schema,
    generate,
    previousSchema,
    undoGenerate,
  };
}
