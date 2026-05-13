import { NextRequest, NextResponse } from "next/server";

const defaultAllowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3006",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3006"
];

function getAllowedOrigins() {
  const configured = process.env.CORS_ALLOWED_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return configured?.length ? configured : defaultAllowedOrigins;
}

function corsHeaders(request: NextRequest) {
  const origin = request.headers.get("origin");
  const allowedOrigins = getAllowedOrigins();
  const allowedOrigin =
    origin && (allowedOrigins.includes("*") || allowedOrigins.includes(origin)) ? origin : "";

  const headers = new Headers();
  if (allowedOrigin) {
    headers.set("Access-Control-Allow-Origin", allowedOrigin);
    headers.set("Vary", "Origin");
  }
  headers.set("Access-Control-Allow-Credentials", "false");
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Idempotency-Key, Razorpay-Signature"
  );
  headers.set("Access-Control-Max-Age", "86400");
  return headers;
}

export function middleware(request: NextRequest) {
  const headers = corsHeaders(request);

  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers });
  }

  const response = NextResponse.next();
  headers.forEach((value, key) => {
    response.headers.set(key, value);
  });
  return response;
}

export const config = {
  matcher: "/api/:path*"
};
