import { NextResponse } from "next/server";
import { auth } from "../auth/[...nextauth]/route";
import { resolveBackendBaseUrl } from "@/lib/backendBaseUrl";

function getBackendUrl(pathname = "") {
    const baseUrl = resolveBackendBaseUrl();
    return `${baseUrl}${pathname}`;
}

async function forwardUpdate(request, method = "PATCH") {
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

    const body = await request.json();

    try {
        const response = await fetch(getBackendUrl("/api/user/update"), {
            method,
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
                msg: "Request failed",
            },
            { status: 500 }
        );
    }
}

export async function PATCH(request) {
    return forwardUpdate(request, "PATCH");
}

export async function POST(request) {
    return forwardUpdate(request, "PATCH");
}
