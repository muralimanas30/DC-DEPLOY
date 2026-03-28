import { NextResponse } from "next/server";
import { auth } from "../../auth/[...nextauth]/route";
import { resolveBackendBaseUrl } from "@/lib/backendBaseUrl";

function getBackendUrl(pathname = "") {
    const baseUrl = resolveBackendBaseUrl();
    return `${baseUrl}${pathname}`;
}

export async function POST(request) {
    const session = await auth();
    const token = session?.user?.token;

    if (!token) {
        return NextResponse.json(
            {
                status: "error",
                statusCode: 401,
                msg: "Unauthorized",
                code: "UNAUTHORIZED",
            },
            { status: 401 }
        );
    }

    let body = {};
    try {
        body = await request.json();
    } catch {
        body = {};
    }

    try {
        const response = await fetch(getBackendUrl("/api/sms/report"), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(body),
            cache: "no-store",
        });

        const payload = await response.json();
        return NextResponse.json(payload, { status: payload?.statusCode || response.status });
    } catch {
        return NextResponse.json(
            {
                status: "error",
                statusCode: 500,
                msg: "Failed to create SMS report",
                code: "SMS_REPORT_PROXY_FAILED",
            },
            { status: 500 }
        );
    }
}
