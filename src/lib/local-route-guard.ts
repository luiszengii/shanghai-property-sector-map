import { NextResponse } from "next/server";
import { isLocalResearchMode } from "@/src/lib/runtime-mode";

export function localRouteNotFound() {
  return new NextResponse(null, {
    status: 404,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export function isLocalRouteEnabled() {
  return isLocalResearchMode;
}
