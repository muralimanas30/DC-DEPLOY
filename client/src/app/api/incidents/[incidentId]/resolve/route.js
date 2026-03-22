import { NextResponse } from "next/server";
import { auth } from "../../../auth/[...nextauth]/route";

function getBackendBaseUrl() {
    return process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
}

export async function PATCH(_request, { params }) {
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
        const response = await fetch(`${getBackendBaseUrl()}/api/incidents/${incidentId}/resolve`, {
            method: "PATCH",
            headers: {
                Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
        });

        let payload = null;
        try {
            payload = await response.json();
        } catch {
            payload = {
                status: response.ok ? "success" : "error",
                statusCode: response.status,
                msg: response.ok ? "Incident resolved" : "Failed to resolve incident",
            };
        }

        return NextResponse.json(payload, { status: payload?.statusCode || response.status });
    } catch {
        return NextResponse.json(
            {
                status: "error",
                statusCode: 500,
                msg: "Failed to resolve incident",
            },
            { status: 500 }
        );
    }
}
