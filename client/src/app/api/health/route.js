import { NextResponse } from "next/server";
import { resolveBackendBaseUrl } from "@/lib/backendBaseUrl";

export async function GET() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    try {
        const response = await fetch(`${resolveBackendBaseUrl()}/api/health`, {
            method: "GET",
            cache: "no-store",
            signal: controller.signal,
        });

        const payload = await response.json();
        return NextResponse.json(payload, { status: payload?.statusCode || response.status });
    } catch {
        return NextResponse.json(
            {
                status: "error",
                statusCode: 503,
                msg: "Backend unavailable",
                code: "BACKEND_UNAVAILABLE",
            },
            { status: 503 }
        );
    } finally {
        clearTimeout(timeoutId);
    }
}
