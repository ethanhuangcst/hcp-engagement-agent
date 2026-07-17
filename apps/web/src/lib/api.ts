import { NextResponse } from "next/server";

export function jsonOk(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function jsonError(
  error: unknown,
  status = 400,
): NextResponse {
  return NextResponse.json(
    typeof error === "object" && error !== null
      ? { error }
      : { error: { code: "INTERNAL_ERROR", message: String(error) } },
    { status },
  );
}
