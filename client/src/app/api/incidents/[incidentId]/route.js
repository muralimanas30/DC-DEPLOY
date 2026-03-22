import { NextResponse } from "next/server";
import { auth } from "../../auth/[...nextauth]/route";

function getErrorPayload(message) {
    return {
        status: "error",
        statusCode: 500,
        msg: message,
    };
}

function getBackendBaseUrl() {
    return process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
}

export async function GET(_request, { params }) {
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

    try {
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

        const response = await fetch(`${getBackendBaseUrl()}/api/incidents/${incidentId}`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
        });

        const payload = await response.json();
        return NextResponse.json(payload, { status: payload?.statusCode || response.status });
    } catch {
        return NextResponse.json(getErrorPayload("Failed to fetch incident details"), { status: 500 });
    }
}
