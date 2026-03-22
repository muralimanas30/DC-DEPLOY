"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

function getIncidentCounts(incident) {
    const victims = Array.isArray(incident?.victims) ? incident.victims.length : 0;
    const volunteers = Array.isArray(incident?.volunteers) ? incident.volunteers.length : 0;
    const admins = Array.isArray(incident?.admins) ? incident.admins.length : 0;

    return {
        victims,
        volunteers,
        participants: victims + volunteers + admins,
    };
}

function UserInfoPanel({ user, onClose, onUnassign, loading, showUnassign }) {
    if (!user) return null;

    return (
        <div className="card bg-base-100 border border-base-300 shadow-md">
            <div className="card-body">
                <div className="flex items-start justify-between gap-3">
                    <h3 className="card-title">User Details</h3>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>Close</button>
                </div>
                <div className="space-y-2 text-sm">
                    <p><span className="font-semibold">Name:</span> {user.name}</p>
                    <p><span className="font-semibold">Email:</span> {user.email}</p>
                    <p><span className="font-semibold">Active Role:</span> {user.activeRole}</p>
                    <p><span className="font-semibold">Skills:</span> {user.skills?.length ? user.skills.join(", ") : "Not added yet"}</p>
                </div>
                {showUnassign && (
                    <button
                        type="button"
                        className="btn btn-warning btn-sm mt-2"
                        onClick={() => onUnassign(user._id)}
                        disabled={loading}
                    >
                        {loading ? "Updating..." : "Unassign User"}
                    </button>
                )}
            </div>
        </div>
    );
}

function ParticipantList({ title, users, onSelectUser, onUnassign, allowUnassign, loading }) {
    return (
        <div className="card bg-base-100 border border-base-300 shadow-md h-full">
            <div className="card-body">
                <h3 className="card-title">{title}</h3>
                {users.length === 0 ? (
                    <p className="text-sm text-base-content/70">No users in this group.</p>
                ) : (
                    <div className="space-y-2">
                        {users.map((user) => (
                            <div key={user._id} className="border border-base-300 rounded-lg p-3 flex items-center justify-between gap-2">
                                <div>
                                    <div className="font-semibold">{user.name}</div>
                                    <div className="text-xs text-base-content/70">{user.email}</div>
                                    <div className="text-xs text-base-content/60">
                                        Skills: {user.skills?.length ? user.skills.join(", ") : "Not added yet"}
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        className="btn btn-sm btn-outline"
                                        onClick={() => onSelectUser(user)}
                                    >
                                        View
                                    </button>
                                    {allowUnassign && (
                                        <button
                                            type="button"
                                            className="btn btn-sm btn-warning"
                                            onClick={() => onUnassign(user._id)}
                                            disabled={loading}
                                        >
                                            Unassign
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export default function IncidentDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { data: session } = useSession();

    const incidentId = useMemo(() => {
        const raw = params?.incidentId;
        if (typeof raw === "string") return raw;
        if (Array.isArray(raw)) return raw[0] || null;
        return null;
    }, [params?.incidentId]);

    const currentRole = session?.user?.activeRole || session?.user?.role || "victim";

    const [incident, setIncident] = useState(null);
    const [participants, setParticipants] = useState({ victims: [], volunteers: [], admins: [] });
    const [availableVolunteers, setAvailableVolunteers] = useState([]);
    const [showVolunteerPicker, setShowVolunteerPicker] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [infoMessage, setInfoMessage] = useState("");
    const [membersVisible, setMembersVisible] = useState(true);
    const [assignedIncidentId, setAssignedIncidentId] = useState(null);

    const isAdmin = currentRole === "admin";
    const isActiveIncident = incident?.status === "active";

    const loadIncident = useCallback(async () => {
        if (!incidentId) return;

        const res = await fetch(`/api/incidents/${incidentId}`, { method: "GET", cache: "no-store" });
        const payload = await res.json();
        if (!res.ok || payload?.status !== "success") {
            throw new Error(payload?.msg || "Failed to fetch incident");
        }

        setIncident(payload?.data?.incident || null);
    }, [incidentId]);

    const loadParticipants = useCallback(async () => {
        if (!incidentId) return;

        const res = await fetch(`/api/incidents/${incidentId}/participants`, { method: "GET", cache: "no-store" });
        const payload = await res.json();
        if (!res.ok || payload?.status !== "success") {
            throw new Error(payload?.msg || "Failed to fetch participants");
        }

        setParticipants(payload?.data?.participants || { victims: [], volunteers: [], admins: [] });
    }, [incidentId]);

    const loadAvailableVolunteers = useCallback(async () => {
        if (!incidentId || !isAdmin || !isActiveIncident) return;

        const res = await fetch(`/api/incidents/${incidentId}/available-volunteers`, { method: "GET", cache: "no-store" });
        const payload = await res.json();
        if (!res.ok || payload?.status !== "success") {
            throw new Error(payload?.msg || "Failed to fetch volunteers");
        }

        setAvailableVolunteers(payload?.data?.volunteers || []);
    }, [incidentId, isAdmin, isActiveIncident]);

    const loadAssignedIncident = useCallback(async () => {
        const res = await fetch("/api/incidents?assignedOnly=true&page=1&limit=1", {
            method: "GET",
            cache: "no-store",
        });

        const payload = await res.json();
        const assigned = payload?.data?.incidents?.[0] || null;
        const assignedId = assigned?._id || assigned?.id || null;
        setAssignedIncidentId(assignedId);
    }, []);

    const refreshAll = useCallback(async () => {
        setError("");
        setLoading(true);
        try {
            await loadIncident();
            await loadAssignedIncident();
            try {
                await loadParticipants();
                setMembersVisible(true);
            } catch {
                setParticipants({ victims: [], volunteers: [], admins: [] });
                setMembersVisible(false);
            }
        } catch (err) {
            setError(err?.message || "Failed to load incident");
        } finally {
            setLoading(false);
        }
    }, [loadIncident, loadParticipants, loadAssignedIncident]);

    useEffect(() => {
        refreshAll();
    }, [refreshAll]);

    useEffect(() => {
        if (!isAdmin || !isActiveIncident || !showVolunteerPicker) {
            setAvailableVolunteers([]);
            return;
        }

        loadAvailableVolunteers().catch((err) => {
            setError(err?.message || "Failed to fetch volunteers");
        });
    }, [isAdmin, isActiveIncident, showVolunteerPicker, loadAvailableVolunteers]);

    const runMutation = async (url, options) => {
        setLoading(true);
        setError("");
        setInfoMessage("");

        try {
            const res = await fetch(url, options);
            const payload = await res.json();
            if (!res.ok || payload?.status !== "success") {
                throw new Error(payload?.msg || "Operation failed");
            }

            if (payload?.data?.autoClosedBecauseNoVictims === true) {
                setInfoMessage("Incident auto-closed because no victims remained assigned.");
            }

            await refreshAll();
            if (showVolunteerPicker) {
                await loadAvailableVolunteers();
            }
        } catch (err) {
            setError(err?.message || "Operation failed");
        } finally {
            setLoading(false);
        }
    };

    const onResolve = async (forceClose = false) => {
        if (!incidentId) return;
        const suffix = forceClose ? "?force=true" : "";
        await runMutation(`/api/incidents/${incidentId}/resolve${suffix}`, { method: "PATCH" });
        setSelectedUser(null);
        setShowVolunteerPicker(false);
    };

    const onJoin = async () => {
        if (!incidentId) return;
        await runMutation(`/api/incidents/${incidentId}/join`, { method: "POST" });
    };

    const onUnassign = async (userId) => {
        if (!incidentId || !userId) return;
        await runMutation(`/api/incidents/${incidentId}/assign/${userId}`, { method: "DELETE" });
        setSelectedUser((prev) => (prev?._id === userId ? null : prev));
    };

    const onAssignVolunteer = async (userId) => {
        if (!incidentId || !userId) return;

        await runMutation(`/api/incidents/${incidentId}/assign`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ userId }),
        });
    };

    const counts = getIncidentCounts(incident);

    const myId = session?.user?.id ? String(session.user.id) : null;
    const victimIds = Array.isArray(incident?.victims) ? incident.victims.map((id) => String(id)) : [];
    const volunteerIds = Array.isArray(incident?.volunteers) ? incident.volunteers.map((id) => String(id)) : [];
    const adminIds = Array.isArray(incident?.admins) ? incident.admins.map((id) => String(id)) : [];
    const isParticipant = myId ? [...victimIds, ...volunteerIds, ...adminIds].includes(myId) : false;
    const isCreator = myId && incident?.creatorId ? String(incident.creatorId) === myId : false;
    const canViewMembers = isAdmin || isCreator || isParticipant;
    const joinBlockedByExistingAssignment = Boolean(
        assignedIncidentId && incidentId && assignedIncidentId !== incidentId
    );

    const canJoin = isActiveIncident && !isParticipant && (currentRole === "victim" || currentRole === "volunteer" || currentRole === "admin");
    const canResolve = isActiveIncident && (isParticipant || isCreator);
    const canForceClose = isActiveIncident && isAdmin;

    return (
        <div className="container mx-auto px-4 py-8 space-y-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <h1 className="text-3xl font-bold">Incident Details</h1>
                <button type="button" className="btn btn-outline" onClick={() => router.push("/incidents")}>Back to Incidents</button>
            </div>

            {infoMessage && (
                <div className="alert alert-info">
                    <span>{infoMessage}</span>
                </div>
            )}

            {error && (
                <div className="alert alert-error">
                    <span>{error}</span>
                </div>
            )}

            {loading && !incident ? (
                <div className="py-8">
                    <span className="loading loading-spinner loading-lg"></span>
                </div>
            ) : incident ? (
                <>
                    <section className="card bg-base-100 shadow-xl border border-base-300">
                        <div className="card-body">
                            <h2 className="card-title text-2xl">{incident.title}</h2>
                            <p className="text-base-content/80">{incident.description}</p>
                            <div className="flex flex-wrap gap-2 mt-2">
                                <span className="badge badge-info">status: {incident.status}</span>
                                <span className="badge badge-warning">severity: {incident.severity}</span>
                                <span className="badge badge-outline">category: {incident.category}</span>
                                <span className="badge badge-primary">victims: {counts.victims}</span>
                                <span className="badge badge-secondary">volunteers: {counts.volunteers}</span>
                                <span className="badge badge-accent">participants: {counts.participants}</span>
                            </div>

                            {isActiveIncident && (
                                <div className="mt-4 flex flex-wrap gap-2">
                                    {canJoin && (
                                        <button
                                            type="button"
                                            className="btn btn-primary btn-sm"
                                            onClick={onJoin}
                                            disabled={loading || joinBlockedByExistingAssignment}
                                        >
                                            {joinBlockedByExistingAssignment ? "Assigned Elsewhere" : "Join Incident"}
                                        </button>
                                    )}

                                    {canResolve && (
                                        <button type="button" className="btn btn-error btn-sm" onClick={() => onResolve(false)} disabled={loading}>
                                            {loading ? "Closing..." : "Mark Closed"}
                                        </button>
                                    )}

                                    {canForceClose && (
                                        <button type="button" className="btn btn-warning btn-sm" onClick={() => onResolve(true)} disabled={loading}>
                                            {loading ? "Closing..." : "Force Close"}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </section>

                    {canViewMembers && membersVisible ? (
                        <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                            <ParticipantList
                                title="Victims"
                                users={participants.victims || []}
                                onSelectUser={setSelectedUser}
                                onUnassign={onUnassign}
                                allowUnassign={isAdmin && isActiveIncident}
                                loading={loading}
                            />

                            <ParticipantList
                                title="Volunteers"
                                users={participants.volunteers || []}
                                onSelectUser={setSelectedUser}
                                onUnassign={onUnassign}
                                allowUnassign={isAdmin && isActiveIncident}
                                loading={loading}
                            />

                            <UserInfoPanel
                                user={selectedUser}
                                onClose={() => setSelectedUser(null)}
                                onUnassign={onUnassign}
                                loading={loading}
                                showUnassign={isAdmin && isActiveIncident}
                            />
                        </section>
                    ) : (
                        <div className="alert alert-info">
                            <span>Members are shown only for incidents you are part of.</span>
                        </div>
                    )}

                    {isAdmin && isActiveIncident && (
                        <section className="card bg-base-100 border border-base-300 shadow-lg">
                            <div className="card-body space-y-3">
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                    <h3 className="card-title">Volunteer Assignment</h3>
                                    <button
                                        type="button"
                                        className="btn btn-primary btn-sm"
                                        onClick={() => setShowVolunteerPicker((prev) => !prev)}
                                        disabled={loading}
                                    >
                                        {showVolunteerPicker ? "Hide Volunteers" : "Add More Volunteers"}
                                    </button>
                                </div>

                                {showVolunteerPicker && (
                                    <div className="space-y-2">
                                        {availableVolunteers.length === 0 ? (
                                            <div className="alert alert-info">
                                                <span>No available volunteers found.</span>
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                                                {availableVolunteers.map((volunteer) => (
                                                    <div key={volunteer._id} className="rounded-lg border border-base-300 p-3 flex items-center justify-between gap-2">
                                                        <div>
                                                            <div className="font-semibold">{volunteer.name}</div>
                                                            <div className="text-xs text-base-content/70">{volunteer.email}</div>
                                                            <div className="text-xs text-base-content/60">
                                                                Skills: {volunteer.skills?.length ? volunteer.skills.join(", ") : "Not added yet"}
                                                            </div>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            className="btn btn-sm btn-success"
                                                            onClick={() => onAssignVolunteer(volunteer._id)}
                                                            disabled={loading}
                                                        >
                                                            Add
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </section>
                    )}
                </>
            ) : (
                <div className="alert alert-warning">
                    <span>Incident not found.</span>
                </div>
            )}
        </div>
    );
}
