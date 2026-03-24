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
    const myUserId = session?.user?.id ? String(session.user.id) : null;

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [feed, setFeed] = useState({
        mode: "global",
        incidents: [],
        assignedIncident: null,
        tracked: { incidentLocation: null, selfLocation: null, participants: [] },
    });
    const [selfLiveLocation, setSelfLiveLocation] = useState(null);
    const [markerFilters, setMarkerFilters] = useState({
        incident: true,
        self: true,
        victim: true,
        volunteer: true,
        admin: true,
    });
    const [liveParticipantLocations, setLiveParticipantLocations] = useState({});

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
    const assignedIncidentId = feed?.assignedIncident?.id ? String(feed.assignedIncident.id) : null;

    useEffect(() => {
        setLiveParticipantLocations({});
    }, [assignedIncidentId]);

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

    useEffect(() => {
        if (!socketToken) return;

        connectSocket(socketToken);

        const onParticipantLocationUpdate = (payload = {}) => {
            const payloadIncidentId = payload?.incidentId ? String(payload.incidentId) : null;
            if (!payloadIncidentId || !assignedIncidentId || payloadIncidentId !== assignedIncidentId) {
                return;
            }

            const lng = Number(payload?.location?.lng);
            const lat = Number(payload?.location?.lat);
            const userId = payload?.userId ? String(payload.userId) : null;
            if (!userId || !Number.isFinite(lng) || !Number.isFinite(lat)) {
                return;
            }

            setLiveParticipantLocations((prev) => ({
                ...prev,
                [userId]: {
                    id: userId,
                    name: payload?.name || "Participant",
                    role: payload?.role || "victim",
                    isSelf: myUserId ? userId === myUserId : false,
                    isOnline: true,
                    location: { lng, lat },
                },
            }));
        };

        subscribeSocketEvent(SOCKET_EVENTS.PARTICIPANT_LOCATION_UPDATE, onParticipantLocationUpdate);

        return () => {
            unsubscribeSocketEvent(SOCKET_EVENTS.PARTICIPANT_LOCATION_UPDATE, onParticipantLocationUpdate);
        };
    }, [socketToken, assignedIncidentId, myUserId]);

    const participantLocationCount = useMemo(() => {
        if (!isAssignedMode) return 0;

        const ids = new Set();
        const withLocation = (candidate) => {
            const lng = Number(candidate?.location?.lng);
            const lat = Number(candidate?.location?.lat);
            return Number.isFinite(lng) && Number.isFinite(lat);
        };

        (feed?.tracked?.participants || []).forEach((participant) => {
            const id = participant?.id ? String(participant.id) : null;
            const isSelf = Boolean(participant?.isSelf) || (myUserId ? id === myUserId : false);
            if (!id || isSelf || !withLocation(participant)) return;
            ids.add(id);
        });

        Object.values(liveParticipantLocations).forEach((participant) => {
            const id = participant?.id ? String(participant.id) : null;
            const isSelf = Boolean(participant?.isSelf) || (myUserId ? id === myUserId : false);
            if (!id || isSelf || !withLocation(participant)) return;
            ids.add(id);
        });

        const self = selfLiveLocation || feed?.tracked?.selfLocation;
        if (myUserId && withLocation({ location: self })) {
            ids.add(String(myUserId));
        }

        return ids.size;
    }, [isAssignedMode, feed, liveParticipantLocations, myUserId, selfLiveLocation]);

    const participantPresence = useMemo(() => {
        if (!isAssignedMode) {
            return { sharing: [], missing: [] };
        }

        const byId = new Map();

        (feed?.tracked?.allParticipants || []).forEach((participant) => {
            const id = participant?.id ? String(participant.id) : null;
            if (!id) return;
            const isSelf = Boolean(participant?.isSelf) || (myUserId ? id === myUserId : false);

            byId.set(id, {
                id,
                name: participant?.name || "Participant",
                role: participant?.role || "victim",
                hasLocation: Boolean(participant?.hasLocation),
                isOnline: Boolean(participant?.isOnline),
                isSelf,
            });
        });

        (feed?.tracked?.participants || []).forEach((participant) => {
            const id = participant?.id ? String(participant.id) : null;
            if (!id) return;
            const isSelf = Boolean(participant?.isSelf) || (myUserId ? id === myUserId : false);

            const existing = byId.get(id) || {
                id,
                name: participant?.name || "Participant",
                role: participant?.role || "victim",
                isOnline: Boolean(participant?.isOnline),
                isSelf,
            };

            byId.set(id, {
                ...existing,
                hasLocation: true,
                isSelf,
                isOnline: Boolean(participant?.isOnline) || existing.isOnline,
            });
        });

        Object.values(liveParticipantLocations).forEach((participant) => {
            const id = participant?.id ? String(participant.id) : null;
            if (!id) return;
            const isSelf = Boolean(participant?.isSelf) || (myUserId ? id === myUserId : false);

            const existing = byId.get(id) || {
                id,
                name: participant?.name || "Participant",
                role: participant?.role || "victim",
                isOnline: Boolean(participant?.isOnline),
                isSelf,
            };

            byId.set(id, {
                ...existing,
                hasLocation: true,
                isSelf,
                isOnline: Boolean(participant?.isOnline) || existing.isOnline,
            });
        });

        const values = Array.from(byId.values()).filter((participant) => !participant.isSelf);
        return {
            sharing: values.filter((participant) => participant.hasLocation),
            missing: values.filter((participant) => !participant.hasLocation),
        };
    }, [isAssignedMode, feed, liveParticipantLocations, myUserId]);

    const expectedParticipantCount = Number(feed?.assignedIncident?.participants || 0);
    const hasPresenceData = (participantPresence.sharing.length + participantPresence.missing.length) > 0;

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

            const participantMap = new Map();

            (tracked?.participants || []).forEach((participant) => {
                const participantId = participant?.id ? String(participant.id) : null;
                if (!participantId) return;
                const isSelf = Boolean(participant?.isSelf) || (myUserId ? participantId === myUserId : false);
                if (isSelf) return;
                participantMap.set(participantId, participant);
            });

            Object.values(liveParticipantLocations).forEach((participant) => {
                const participantId = participant?.id ? String(participant.id) : null;
                if (!participantId) return;
                const isSelf = Boolean(participant?.isSelf) || (myUserId ? participantId === myUserId : false);
                if (isSelf) return;
                participantMap.set(participantId, participant);
            });

            participantMap.forEach((participant) => {
                const location = participant?.location;
                if (!location || !Number.isFinite(location.lng) || !Number.isFinite(location.lat)) return;

                markers.push({
                    id: `participant:${participant.id}`,
                    type: participant?.role || "victim",
                    title: participant?.name || "Participant",
                    label: `Role: ${participant?.role || "victim"}`,
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
    }, [isAssignedMode, feed, selfLiveLocation, liveParticipantLocations, myUserId]);

    const visibleMarkers = useMemo(() => {
        return markerSet.filter((marker) => {
            const type = marker?.type || "incident";
            return markerFilters[type] ?? true;
        });
    }, [markerSet, markerFilters]);

    const toggleFilter = (type) => {
        setMarkerFilters((prev) => ({
            ...prev,
            [type]: !prev[type],
        }));
    };

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
                    <div className="mt-2 flex gap-4 flex-wrap text-sm">
                        <label className="label cursor-pointer gap-2 p-0">
                            <input type="checkbox" className="checkbox checkbox-xs checkbox-error" checked={markerFilters.incident} onChange={() => toggleFilter("incident")} />
                            <span className="label-text">Incidents</span>
                        </label>
                        <label className="label cursor-pointer gap-2 p-0">
                            <input type="checkbox" className="checkbox checkbox-xs checkbox-info" checked={markerFilters.self} onChange={() => toggleFilter("self")} />
                            <span className="label-text">You</span>
                        </label>
                        <label className="label cursor-pointer gap-2 p-0">
                            <input type="checkbox" className="checkbox checkbox-xs checkbox-warning" checked={markerFilters.victim} onChange={() => toggleFilter("victim")} />
                            <span className="label-text">Victims</span>
                        </label>
                        <label className="label cursor-pointer gap-2 p-0">
                            <input type="checkbox" className="checkbox checkbox-xs checkbox-success" checked={markerFilters.volunteer} onChange={() => toggleFilter("volunteer")} />
                            <span className="label-text">Volunteers</span>
                        </label>
                        <label className="label cursor-pointer gap-2 p-0">
                            <input type="checkbox" className="checkbox checkbox-xs" checked={markerFilters.admin} onChange={() => toggleFilter("admin")} />
                            <span className="label-text">Admins</span>
                        </label>
                    </div>
                    {isAssignedMode ? (
                        <p className="text-xs text-base-content/70">
                            Live participant markers with location: {participantLocationCount} / {feed?.assignedIncident?.participants ?? 0}
                        </p>
                    ) : null}
                </div>
            </section>

            {error ? (
                <div className="alert alert-error">
                    <span>{error}</span>
                </div>
            ) : null}

            {isAssignedMode ? (
                <section className="card bg-base-100 border border-base-300 shadow">
                    <div className="card-body py-4">
                        <h2 className="card-title text-lg">Participant Location Status</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                            <div>
                                <div className="font-semibold text-success mb-2">Sharing Live Location ({participantPresence.sharing.length})</div>
                                {participantPresence.sharing.length === 0 ? (
                                    <p className="text-base-content/70">
                                        {(!hasPresenceData && expectedParticipantCount > 0)
                                            ? "Collecting participant status..."
                                            : "No participant is publishing location yet."}
                                    </p>
                                ) : (
                                    <div className="space-y-1">
                                        {participantPresence.sharing.map((participant) => (
                                            <div key={participant.id} className="flex items-center gap-2">
                                                <span className="badge badge-success badge-xs"></span>
                                                <span>{participant.name}</span>
                                                <span className="text-base-content/60">({participant.role})</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div>
                                <div className="font-semibold text-warning mb-2">Not Sharing Yet ({participantPresence.missing.length})</div>
                                {participantPresence.missing.length === 0 ? (
                                    <p className="text-base-content/70">
                                        {(!hasPresenceData && expectedParticipantCount > 0)
                                            ? "Collecting participant status..."
                                            : "All participants are sharing live location."}
                                    </p>
                                ) : (
                                    <div className="space-y-1">
                                        {participantPresence.missing.map((participant) => (
                                            <div key={participant.id} className="flex items-center gap-2">
                                                <span className="badge badge-warning badge-xs"></span>
                                                <span>{participant.name}</span>
                                                <span className="text-base-content/60">({participant.role})</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </section>
            ) : null}

            {loading ? (
                <section className="card bg-base-100 border border-base-300 shadow">
                    <div className="card-body py-10">
                        <span className="loading loading-spinner loading-lg" />
                    </div>
                </section>
            ) : visibleMarkers.length === 0 ? (
                <section className="card bg-base-100 border border-base-300 shadow">
                    <div className="card-body">
                        <p className="text-base-content/70">No markers are visible with current filter selection.</p>
                    </div>
                </section>
            ) : (
                <LocationMap markers={visibleMarkers} />
            )}
        </div>
    );
}
