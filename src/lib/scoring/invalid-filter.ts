export type InvalidFilterField = "carrierId" | "region" | "productType" | "period";

export type InvalidFilterDetails = {
  field: InvalidFilterField;
  value: string;
  allowed?: string[];
};

export class InvalidFilterError extends Error {
  readonly code = "INVALID_FILTER" as const;
  readonly status = 400 as const;
  readonly details: InvalidFilterDetails;

  constructor(params: InvalidFilterDetails) {
    const message = `Invalid filter value for ${params.field}.`;
    super(message);
    this.name = "InvalidFilterError";
    this.details = params;
  }
}

export function isInvalidFilterError(error: unknown): error is InvalidFilterError {
  return error instanceof InvalidFilterError;
}
