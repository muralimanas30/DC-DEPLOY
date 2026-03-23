import { NextResponse } from "next/server";
import { auth } from "../../auth/[...nextauth]/route";

function getBackendBaseUrl() {
    return process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
}

function hasValidCoordinates(geo) {
    const coordinates = geo?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length !== 2) return false;

    const [lng, lat] = coordinates;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return false;

    if (Math.abs(lng) < 0.000001 && Math.abs(lat) < 0.000001) return false;

    return true;
}

function mapIncident(incident = {}) {
    const coordinates = incident?.location?.coordinates || [];
    return {
        id: incident?._id || incident?.id || null,
        title: incident?.title || "Incident",
        description: incident?.description || "",
        severity: incident?.severity || "medium",
        category: incident?.category || "general",
        status: incident?.status || "active",
        participants:
            (Array.isArray(incident?.victims) ? incident.victims.length : 0)
            + (Array.isArray(incident?.volunteers) ? incident.volunteers.length : 0)
            + (Array.isArray(incident?.admins) ? incident.admins.length : 0),
        location: {
            lng: Number(coordinates[0]),
            lat: Number(coordinates[1]),
        },
        createdAt: incident?.createdAt,
    };
}

function mapParticipant(user = {}) {
    const coordinates = user?.currentLocation?.coordinates || [];
    const lng = Number(coordinates[0]);
    const lat = Number(coordinates[1]);

    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;

    return {
        id: user?._id || user?.id || null,
        name: user?.name || user?.email || "Responder",
        role: user?.activeRole || "victim",
        isSelf: false,
        isOnline: Boolean(user?.isOnline),
        location: { lng, lat },
    };
}

async function fetchFallbackMapFeed(token) {
    const headers = { Authorization: `Bearer ${token}` };
    const base = getBackendBaseUrl();

    const [incidentsRes, assignedRes] = await Promise.all([
        fetch(`${base}/api/incidents?status=active&page=1&limit=300`, {
            method: "GET",
            headers,
            cache: "no-store",
        }),
        fetch(`${base}/api/incidents?assignedOnly=true&page=1&limit=1`, {
            method: "GET",
            headers,
            cache: "no-store",
        }),
    ]);

    const incidentsPayload = await incidentsRes.json();
    const assignedPayload = await assignedRes.json();

    const activeIncidents = Array.isArray(incidentsPayload?.data?.incidents)
        ? incidentsPayload.data.incidents
        : [];
    const mappedIncidents = activeIncidents
        .filter((incident) => hasValidCoordinates(incident?.location))
        .map(mapIncident);

    const assignedCandidate = Array.isArray(assignedPayload?.data?.incidents)
        ? assignedPayload.data.incidents[0]
        : null;

    const assignedIncident = assignedCandidate && hasValidCoordinates(assignedCandidate?.location)
        ? mapIncident(assignedCandidate)
        : null;

    let participantLocations = [];
    if (assignedIncident?.id) {
        const participantsRes = await fetch(`${base}/api/incidents/${assignedIncident.id}/participants`, {
            method: "GET",
            headers,
            cache: "no-store",
        });

        if (participantsRes.ok) {
            const participantsPayload = await participantsRes.json();
            const participants = participantsPayload?.data?.participants || {};
            participantLocations = [
                ...(participants.victims || []),
                ...(participants.volunteers || []),
                ...(participants.admins || []),
            ].map(mapParticipant).filter(Boolean);
        }
    }

    return {
        mode: assignedIncident ? "assigned" : "global",
        incidents: mappedIncidents,
        assignedIncident,
        tracked: {
            incidentLocation: assignedIncident?.location || null,
            selfLocation: null,
            participants: participantLocations,
        },
    };
}

export async function GET() {
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
        const response = await fetch(`${getBackendBaseUrl()}/api/incidents/map-feed`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
        });

        const payload = await response.json();

        if (!response.ok && payload?.code === "INVALID_INCIDENT_ID") {
            const fallback = await fetchFallbackMapFeed(token);
            return NextResponse.json(
                {
                    status: "success",
                    statusCode: 200,
                    msg: "Incident map feed fetched successfully",
                    data: fallback,
                },
                { status: 200 }
            );
        }

        return NextResponse.json(payload, { status: payload?.statusCode || response.status });
    } catch {
        try {
            const fallback = await fetchFallbackMapFeed(token);
            return NextResponse.json(
                {
                    status: "success",
                    statusCode: 200,
                    msg: "Incident map feed fetched successfully",
                    data: fallback,
                },
                { status: 200 }
            );
        } catch {
            return NextResponse.json(
                {
                    status: "error",
                    statusCode: 500,
                    msg: "Failed to fetch map feed",
                },
                { status: 500 }
            );
        }
    }
}
