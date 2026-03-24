import { NextResponse } from "next/server";
import { auth } from "../../../auth/[...nextauth]/route";
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

    try {
        const body = await request.json();

        const response = await fetch(`${getBackendBaseUrl()}/api/incidents/${incidentId}/assign`, {
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
                msg: "Failed to assign user",
            },
            { status: 500 }
        );
    }
}
