"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import { connectSocket, subscribeSocketEvent, unsubscribeSocketEvent } from "@/hooks/useSocket";
import { SOCKET_EVENTS } from "@/lib/realtime";

const LocationMap = dynamic(() => import("@/components/LocationMap"), { ssr: false });

function toFixed(value) {
    return Number.isFinite(value) ? Number(value).toFixed(5) : "-";
}

export default function MapPage() {
    const { data: session } = useSession();
    const socketToken = session?.user?.token;

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [feed, setFeed] = useState({
        mode: "global",
        incidents: [],
        assignedIncident: null,
        tracked: { incidentLocation: null, selfLocation: null, participants: [] },
    });
    const [selfLiveLocation, setSelfLiveLocation] = useState(null);

    const lastLocationPushAtRef = useRef(0);

    const loadMapFeed = useCallback(async () => {
        try {
            const response = await fetch("/api/incidents/map-feed", {
                method: "GET",
                cache: "no-store",
            });

            const payload = await response.json();
            if (!response.ok || payload?.status !== "success") {
                throw new Error(payload?.msg || "Failed to load incident map feed");
            }

            setFeed(payload?.data || {
                mode: "global",
                incidents: [],
                assignedIncident: null,
                tracked: { incidentLocation: null, selfLocation: null, participants: [] },
            });
            setError("");
        } catch (err) {
            setError(err?.message || "Failed to load incident map feed");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        setLoading(true);
        loadMapFeed();
    }, [loadMapFeed]);

    useEffect(() => {
        if (!socketToken) return;

        connectSocket(socketToken);

        const onIncidentMutation = () => {
            loadMapFeed();
        };

        subscribeSocketEvent(SOCKET_EVENTS.INCIDENT_CHANGED, onIncidentMutation);
        subscribeSocketEvent(SOCKET_EVENTS.INCIDENT_CLOSED, onIncidentMutation);

        return () => {
            unsubscribeSocketEvent(SOCKET_EVENTS.INCIDENT_CHANGED, onIncidentMutation);
            unsubscribeSocketEvent(SOCKET_EVENTS.INCIDENT_CLOSED, onIncidentMutation);
        };
    }, [socketToken, loadMapFeed]);

    useEffect(() => {
        const intervalId = setInterval(() => {
            loadMapFeed();
        }, 15000);

        return () => clearInterval(intervalId);
    }, [loadMapFeed]);

    const isAssignedMode = feed?.mode === "assigned" && Boolean(feed?.assignedIncident);

    useEffect(() => {
        if (typeof navigator === "undefined" || !("geolocation" in navigator)) return;

        const pushLocationToServer = async (lng, lat) => {
            const now = Date.now();
            if (now - lastLocationPushAtRef.current < 8000) return;
            lastLocationPushAtRef.current = now;

            try {
                await fetch("/api/update", {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        currentLocation: { type: "Point", coordinates: [lng, lat] },
                        isOnline: true,
                        lastSeen: new Date().toISOString(),
                    }),
                });
            } catch {
            }
        };

        const watchId = navigator.geolocation.watchPosition(
            (position) => {
                const lng = Number(position?.coords?.longitude);
                const lat = Number(position?.coords?.latitude);
                if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;

                setSelfLiveLocation({ lng, lat });
                pushLocationToServer(lng, lat);
            },
            () => {
            },
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
        );

        return () => {
            navigator.geolocation.clearWatch(watchId);
        };
    }, []);

    const markerSet = useMemo(() => {
        if (isAssignedMode) {
            const markers = [];
            const assigned = feed?.assignedIncident;
            const tracked = feed?.tracked || {};

            if (assigned?.location) {
                markers.push({
                    id: `incident:${assigned.id}`,
                    type: "incident",
                    title: assigned.title || "Assigned incident",
                    label: "Reported incident location",
                    lng: assigned.location.lng,
                    lat: assigned.location.lat,
                    href: `/incidents/${assigned.id}`,
                    details: [
                        `Severity: ${assigned.severity || "n/a"}`,
                        `Status: ${assigned.status || "active"}`,
                        `Participants: ${assigned.participants ?? 0}`,
                    ],
                });
            }

            const self = selfLiveLocation || tracked?.selfLocation;
            if (self && Number.isFinite(self.lng) && Number.isFinite(self.lat)) {
                markers.push({
                    id: "self:live",
                    type: "self",
                    title: "Your Live Location",
                    label: "Tracked from your device",
                    lng: self.lng,
                    lat: self.lat,
                    details: [`Lng: ${toFixed(self.lng)}`, `Lat: ${toFixed(self.lat)}`],
                });
            }

            (tracked?.participants || []).forEach((participant) => {
                const location = participant?.location;
                if (!location || !Number.isFinite(location.lng) || !Number.isFinite(location.lat)) return;

                markers.push({
                    id: `participant:${participant.id}`,
                    type: participant?.isSelf ? "self" : (participant?.role || "victim"),
                    title: participant?.name || "Participant",
                    label: participant?.isSelf ? "You" : `Role: ${participant?.role || "victim"}`,
                    lng: location.lng,
                    lat: location.lat,
                    details: [
                        `Online: ${participant?.isOnline ? "yes" : "no"}`,
                        `Lng: ${toFixed(location.lng)}`,
                        `Lat: ${toFixed(location.lat)}`,
                    ],
                });
            });

            return markers;
        }

        const markers = (feed?.incidents || []).map((incident) => ({
            id: incident.id,
            type: "incident",
            title: incident.title,
            label: incident.category || "general",
            lng: incident?.location?.lng,
            lat: incident?.location?.lat,
            href: `/incidents/${incident.id}`,
            details: [
                `Severity: ${incident.severity || "n/a"}`,
                `Status: ${incident.status || "active"}`,
                `Participants: ${incident.participants ?? 0}`,
            ],
        }));

        const self = selfLiveLocation || feed?.tracked?.selfLocation;
        if (self && Number.isFinite(self.lng) && Number.isFinite(self.lat)) {
            markers.push({
                id: "self:live",
                type: "self",
                title: "Your Live Location",
                label: "Tracked from your device",
                lng: self.lng,
                lat: self.lat,
                details: [`Lng: ${toFixed(self.lng)}`, `Lat: ${toFixed(self.lat)}`],
            });
        }

        return markers;
    }, [isAssignedMode, feed, selfLiveLocation]);

    return (
        <div className="container mx-auto px-4 py-8 space-y-4">
            <section className="card bg-base-100 border border-base-300 shadow-lg">
                <div className="card-body">
                    <h1 className="card-title text-3xl">Incident Map</h1>
                    <p className="text-base-content/70">
                        {isAssignedMode
                            ? "Assigned mode: track incident location, your live location, and all participants in realtime."
                            : "Global mode: all active reported incidents plus your current location are visible on the map."}
                    </p>
                    <div className="flex gap-2 flex-wrap text-xs">
                        <span className="badge badge-error">Red: Incident</span>
                        <span className="badge badge-info">Blue: You</span>
                        <span className="badge badge-warning">Orange: Victim</span>
                        <span className="badge badge-success">Green: Volunteer</span>
                        <span className="badge" style={{ backgroundColor: "#9333ea", color: "white" }}>Purple: Admin</span>
                    </div>
                </div>
            </section>

            {error ? (
                <div className="alert alert-error">
                    <span>{error}</span>
                </div>
            ) : null}

            {loading ? (
                <section className="card bg-base-100 border border-base-300 shadow">
                    <div className="card-body py-10">
                        <span className="loading loading-spinner loading-lg" />
                    </div>
                </section>
            ) : markerSet.length === 0 ? (
                <section className="card bg-base-100 border border-base-300 shadow">
                    <div className="card-body">
                        <p className="text-base-content/70">No mappable incident/location data is currently available.</p>
                    </div>
                </section>
            ) : (
                <LocationMap markers={markerSet} />
            )}
        </div>
    );
}
