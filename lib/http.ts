import { NextResponse } from "next/server";

export type ApiResult<T> = {
  status: number;
  body: T;
};

export function json<T>(result: ApiResult<T>) {
  return NextResponse.json(result.body, { status: result.status });
}

export function badRequest(message: string) {
  return json({ status: 400, body: { error: message } });
}

export function conflict(message = "Not enough stock available") {
  return json({ status: 409, body: { error: message } });
}

export function gone(message = "Reservation expired") {
  return json({ status: 410, body: { error: message } });
}

export function serviceUnavailable(message: string) {
  return json({ status: 503, body: { error: message } });
}
