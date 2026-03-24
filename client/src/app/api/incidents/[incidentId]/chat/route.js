import { NextResponse } from "next/server";
import { auth } from "../../../auth/[...nextauth]/route";
import { resolveBackendBaseUrl } from "@/lib/backendBaseUrl";

function getBackendBaseUrl() {
    return resolveBackendBaseUrl();
}

function unauthorized() {
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

function invalidIncident() {
    return NextResponse.json(
        {
            status: "error",
            statusCode: 400,
            msg: "Invalid incident id",
            code: "INVALID_INCIDENT_ID",
        },
        { status: 400 }
    );
}

export async function GET(request, { params }) {
    const session = await auth();
    const token = session?.user?.token;

    if (!token) return unauthorized();

    const { incidentId } = await params;
    if (!incidentId) return invalidIncident();

    const page = request?.nextUrl?.searchParams?.get("page") || "1";
    const limit = request?.nextUrl?.searchParams?.get("limit") || "30";

    try {
        const response = await fetch(`${getBackendBaseUrl()}/api/incidents/${incidentId}/chat?page=${page}&limit=${limit}`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
        });

        const payload = await response.json();
        return NextResponse.json(payload, { status: payload?.statusCode || response.status });
    } catch {
        return NextResponse.json(
            {
                status: "error",
                statusCode: 500,
                msg: "Failed to fetch chat messages",
            },
            { status: 500 }
        );
    }
}

export async function POST(request, { params }) {
    const session = await auth();
    const token = session?.user?.token;

    if (!token) return unauthorized();

    const { incidentId } = await params;
    if (!incidentId) return invalidIncident();

    let body = {};
    try {
        body = await request.json();
    } catch {
        body = {};
    }

    try {
        const response = await fetch(`${getBackendBaseUrl()}/api/incidents/${incidentId}/chat`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
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
                msg: "Failed to send chat message",
            },
            { status: 500 }
        );
    }
}
