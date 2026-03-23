"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { connectSocket, subscribeSocketEvent, unsubscribeSocketEvent } from "@/hooks/useSocket";
import { SOCKET_EVENTS } from "@/lib/realtime";

const initialStats = {
    active: 0,
    closed: 0,
    total: 0,
};

async function fetchCount(query) {
    const res = await fetch(`/api/incidents?${query}`, {
        method: "GET",
        cache: "no-store",
    });

    if (!res.ok) {
        return 0;
    }

    const payload = await res.json();
    return Number(payload?.meta?.total || 0);
}

export default function IncidentPulseRealtimeCard() {
    const { data: session } = useSession();
    const token = session?.user?.token;

    const [stats, setStats] = useState(initialStats);

    const refreshStats = useCallback(async () => {
        try {
            const [active, closed, total] = await Promise.all([
                fetchCount("page=1&limit=1&status=active"),
                fetchCount("page=1&limit=1&status=closed"),
                fetchCount("page=1&limit=1"),
            ]);

            setStats({ active, closed, total });
        } catch {
            setStats(initialStats);
        }
    }, []);

    useEffect(() => {
        if (!token) return;

        connectSocket(token);

        const onIncidentChanged = () => {
            refreshStats();
        };

        const onSocketConnect = () => {
            refreshStats();
        };

        const initialRefreshTimer = setTimeout(() => {
            refreshStats();
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
    }, [token, refreshStats]);

    if (!token) {
        return (
            <article className="card bg-base-100 border border-base-300 shadow-xl">
                <div className="card-body">
                    <h2 className="card-title text-xl">Incident Pulse</h2>
                    <p className="text-sm text-base-content/70">Sign in to view live incident metrics.</p>
                </div>
            </article>
        );
    }

    return (
        <article className="card bg-base-100 border border-base-300 shadow-xl">
            <div className="card-body">
                <h2 className="card-title text-xl">Incident Pulse</h2>
                <p className="text-sm text-base-content/70">
                    Live totals update automatically on incident lifecycle changes.
                </p>

                <div className="mt-2 flex flex-wrap gap-2">
                    <span className="badge badge-primary">Active: {stats.active}</span>
                    <span className="badge badge-secondary">Closed: {stats.closed}</span>
                    <span className="badge badge-outline">Total: {stats.total}</span>
                </div>
            </div>
        </article>
    );
}
