import { ValidationError } from "class-validator";
import type { ValidationErrorField } from "../errors";

export interface MappedValidationError {
  message: string;
  fields: ValidationErrorField[];
}

export function mapValidationErrors(
  errors: ValidationError[],
): MappedValidationError {
  const fields: ValidationErrorField[] = errors.map((error) => {
    const constraints = error.constraints
      ? Object.values(error.constraints)
      : [];

    return {
      field: error.property,
      errors: constraints,
    };
  });

  return {
    message: "Validation failed",
    fields,
  };
}
