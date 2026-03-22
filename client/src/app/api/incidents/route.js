import { NextResponse } from "next/server";
import { auth } from "../auth/[...nextauth]/route";

function getBackendUrl(pathname = "") {
    const baseUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
    return `${baseUrl}${pathname}`;
}

function getErrorPayload(message) {
    return {
        status: "error",
        statusCode: 500,
        msg: message,
    };
}

export async function GET(request) {
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

    const query = request.nextUrl.searchParams.toString();

    try {
        const response = await fetch(getBackendUrl(`/api/incidents${query ? `?${query}` : ""}`), {
            method: "GET",
            headers: {
                Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
        });

        const payload = await response.json();
        return NextResponse.json(payload, { status: payload?.statusCode || response.status });
    } catch {
        return NextResponse.json(getErrorPayload("Failed to fetch incidents"), { status: 500 });
    }
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

    const body = await request.json();

    try {
        const response = await fetch(getBackendUrl("/api/incidents"), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(body),
        });

        const payload = await response.json();
        return NextResponse.json(payload, { status: payload?.statusCode || response.status });
    } catch {
        return NextResponse.json(getErrorPayload("Failed to create incident"), { status: 500 });
    }
}
