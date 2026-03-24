import { NextResponse } from "next/server";
import { auth } from "../../../../auth/[...nextauth]/route";
import { resolveBackendBaseUrl } from "@/lib/backendBaseUrl";

function getBackendBaseUrl() {
    return resolveBackendBaseUrl();
}

export async function POST(request, { params }) {
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

    const { incidentId } = await params;
    if (!incidentId) {
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

    let body = {};
    try {
        body = await request.json();
    } catch {
        body = {};
    }

    try {
        const response = await fetch(`${getBackendBaseUrl()}/api/incidents/${incidentId}/chat/alert`, {
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
                msg: "Failed to send alert",
            },
            { status: 500 }
        );
    }
}
