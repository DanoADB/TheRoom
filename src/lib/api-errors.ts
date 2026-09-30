import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export function apiErrorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: error.status },
    );
  }

  if (error instanceof ZodError) {
    return Response.json(
      { error: { code: "invalid_request", message: "Request validation failed.", details: error.issues } },
      { status: 400 },
    );
  }

  console.error("Unhandled API error", error);
  return Response.json(
    { error: { code: "internal_error", message: "An unexpected error occurred." } },
    { status: 500 },
  );
}
