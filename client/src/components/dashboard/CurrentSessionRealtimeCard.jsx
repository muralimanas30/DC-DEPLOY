"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { connectSocket, subscribeSocketEvent, unsubscribeSocketEvent } from "@/hooks/useSocket";
import { SOCKET_EVENTS } from "@/lib/realtime";

export default function CurrentSessionRealtimeCard({
    initialUserName,
    initialRole,
    initialAssignedIncident,
}) {
    const { data: session } = useSession();
    const token = session?.user?.token;

    const [assignedIncidentId, setAssignedIncidentId] = useState(initialAssignedIncident || null);

    const userName = session?.user?.name || initialUserName || "Guest";
    const role = session?.user?.activeRole || session?.user?.role || initialRole || "guest";

    const refreshAssignedIncident = useCallback(async () => {
        try {
            const res = await fetch("/api/incidents?assignedOnly=true&page=1&limit=1", {
                method: "GET",
                cache: "no-store",
            });

            if (!res.ok) {
                setAssignedIncidentId(null);
                return;
            }

            const payload = await res.json();
            const assigned = payload?.data?.incidents?.[0] || null;
            const assignedId = assigned?._id || assigned?.id || null;
            setAssignedIncidentId(assignedId);
        } catch {
            setAssignedIncidentId(null);
        }
    }, []);

    useEffect(() => {
        if (!token) return;

        connectSocket(token);

        const onIncidentChanged = () => {
            refreshAssignedIncident();
        };

        const onSocketConnect = () => {
            refreshAssignedIncident();
        };

        const initialRefreshTimer = setTimeout(() => {
            refreshAssignedIncident();
        }, 0);

        subscribeSocketEvent(SOCKET_EVENTS.INCIDENT_CHANGED, onIncidentChanged);
        subscribeSocketEvent(SOCKET_EVENTS.INCIDENT_CLOSED, onIncidentChanged);
        subscribeSocketEvent("connect", onSocketConnect);

        return () => {
            clearTimeout(initialRefreshTimer);
            unsubscribeSocketEvent(SOCKET_EVENTS.INCIDENT_CHANGED, onIncidentChanged);
            unsubscribeSocketEvent(SOCKET_EVENTS.INCIDENT_CLOSED, onIncidentChanged);
            unsubscribeSocketEvent("connect", onSocketConnect);
        };
    }, [token, refreshAssignedIncident]);

    return (
        <article className="card bg-base-100 border border-base-300 shadow-xl">
            <div className="card-body">
                <h2 className="card-title text-xl">Current Session</h2>
                <div className="space-y-2 text-sm">
                    <p><span className="font-semibold">User:</span> {userName}</p>
                    <p><span className="font-semibold">Role:</span> {role}</p>
                    <p>
                        <span className="font-semibold">Assignment:</span>{" "}
                        {assignedIncidentId ? "Active incident linked" : "No active assignment"}
                    </p>
                </div>

                {assignedIncidentId && (
                    <Link href="/incidents" className="btn btn-primary btn-sm mt-3">
                        Open Assigned Incident
                    </Link>
                )}
            </div>
        </article>
    );
}
