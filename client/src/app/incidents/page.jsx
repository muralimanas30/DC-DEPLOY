"use client";

import { useEffect, useMemo, useState } from "react";
import useIncident from "@/hooks/useIncident";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

const severities = ["low", "medium", "high", "critical"];
const activeStatuses = ["active"];

function extractIncidentId(value) {
    if (!value) return null;
    if (typeof value === "string") return value;
    if (typeof value === "object") {
        return value._id || value.id || value.incidentId || null;
    }
    return null;
}

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

export default function IncidentsPage() {
    const router = useRouter();
    const {
        incidents,
        meta,
        loading,
        creating,
        error,
        clearError,
        listIncidents,
        createIncident,
        joinIncident,
    } = useIncident();
    const { data: session } = useSession();
    const currentRole = session?.user?.activeRole || session?.user?.role || "victim";
    const myUserId = session?.user?.id || null;
    const enforceAssignedLock = currentRole !== "admin";

    const [page, setPage] = useState(1);
    const [severity, setSeverity] = useState("");
    const [status, setStatus] = useState("");
    const [form, setForm] = useState({
        title: "",
        description: "",
        category: "general",
        severity: "medium",
    });
    const [checkingActiveIncident, setCheckingActiveIncident] = useState(true);
    const [hasActiveIncident, setHasActiveIncident] = useState(false);
    const [activeIncidentId, setActiveIncidentId] = useState(null);
    const [assignedIncidentSnapshot, setAssignedIncidentSnapshot] = useState(null);
    const [infoMessage, setInfoMessage] = useState("");
    const assignedIncidentId = extractIncidentId(session?.user?.assignedIncident) || activeIncidentId;

    useEffect(() => {
        let ignore = false;

        const checkMyActiveIncident = async () => {
            setCheckingActiveIncident(true);

            try {
                const res = await fetch("/api/incidents?assignedOnly=true&page=1&limit=1", {
                    method: "GET",
                    cache: "no-store",
                });

                const payload = await res.json();
                const assignedIncidents = payload?.data?.incidents || [];
                const activeIncident = assignedIncidents.find((incident) =>
                    activeStatuses.includes(incident?.status)
                ) || assignedIncidents[0];

                if (!ignore) {
                    setHasActiveIncident(Boolean(activeIncident));
                    const incidentId = extractIncidentId(activeIncident);
                    setActiveIncidentId(incidentId);
                    setAssignedIncidentSnapshot(activeIncident || null);
                }
            } catch {
                if (!ignore) {
                    const sessionAssignedIncident = session?.user?.assignedIncident;
                    const incidentId = extractIncidentId(sessionAssignedIncident);
                    setHasActiveIncident(Boolean(incidentId));
                    setActiveIncidentId(incidentId);
                    setAssignedIncidentSnapshot(null);
                }
            } finally {
                if (!ignore) setCheckingActiveIncident(false);
            }
        };

        checkMyActiveIncident();

        return () => {
            ignore = true;
        };
    }, [session?.user?.assignedIncident]);

    useEffect(() => {
        if (enforceAssignedLock && hasActiveIncident) return;
        listIncidents({ page, limit: 10, severity, status });
    }, [enforceAssignedLock, hasActiveIncident, listIncidents, page, severity, status]);

    const canGoPrev = useMemo(() => page > 1, [page]);
    const canGoNext = useMemo(() => page < (meta?.totalPages || 1), [page, meta?.totalPages]);

    const onSubmit = async (event) => {
        event.preventDefault();
        clearError();

        const created = await createIncident(form);
        if (!created) return;

        const createdId = created?._id || created?.id || null;
        if (createdId) {
            router.push(`/incidents/${createdId}`);
            return;
        }

        setForm({
            title: "",
            description: "",
            category: "general",
            severity: "medium",
        });

        await listIncidents({ page: 1, limit: 10, severity, status });
        setPage(1);
    };

    const onJoin = async (incidentId) => {
        clearError();
        setInfoMessage("");
        const joined = await joinIncident(incidentId);
        if (!joined) return;

        if (joined?.autoClosedBecauseNoVictims === true) {
            setInfoMessage("Incident auto-closed because no victims remained assigned.");
        }

        const joinedId = joined?._id || joined?.id || incidentId;
        if (joinedId) {
            router.push(`/incidents/${joinedId}`);
            return;
        }

        await listIncidents({ page: 1, limit: 10, severity, status });
        setPage(1);
    };

    return (
        <div className="container mx-auto px-4 py-8 space-y-6">
            <section className="card bg-base-100 shadow-xl border border-base-300">
                <div className="card-body">
                    <h1 className="card-title text-3xl">Incidents</h1>
                    <p className="text-base-content/70">
                        {enforceAssignedLock && hasActiveIncident
                            ? "You are assigned to an active incident. Only your current incident is visible."
                            : "Create/join incidents and manage participation based on your role."}
                    </p>
                </div>
            </section>

            {infoMessage && (
                <section className="card bg-base-100 border border-base-300 shadow-md">
                    <div className="card-body py-3">
                        <div className="alert alert-info">
                            <span>{infoMessage}</span>
                        </div>
                    </div>
                </section>
            )}

            {checkingActiveIncident && (
                <section className="card bg-base-100 shadow-lg border border-base-300">
                    <div className="card-body">
                        <span className="loading loading-spinner loading-md"></span>
                    </div>
                </section>
            )}

            {!checkingActiveIncident && enforceAssignedLock && hasActiveIncident && (
                <section className="card bg-base-100 shadow-lg border border-base-300">
                    <div className="card-body">
                        {error && (
                            <div className="alert alert-error mb-2">
                                <span>{error}</span>
                            </div>
                        )}

                        {assignedIncidentSnapshot ? (
                            <>
                                {(() => {
                                    const currentIncident = assignedIncidentSnapshot;
                                    const currentId = extractIncidentId(currentIncident);
                                    const {
                                        victims: currentVictims,
                                        volunteers: currentVolunteers,
                                        participants: currentParticipants,
                                    } = getIncidentCounts(currentIncident);

                                    return (
                                        <>
                                <h2 className="card-title">Current Assigned Incident</h2>
                                <p className="text-sm text-base-content/70">ID: {currentId}</p>
                                <h3 className="text-xl font-semibold">{currentIncident.title}</h3>
                                <p>{currentIncident.description}</p>
                                <div className="flex gap-2 flex-wrap">
                                    <span className="badge badge-info">status: {currentIncident.status}</span>
                                    <span className="badge badge-warning">severity: {currentIncident.severity}</span>
                                    <span className="badge badge-outline">category: {currentIncident.category}</span>
                                    <span className="badge badge-primary">victims: {currentVictims}</span>
                                    <span className="badge badge-secondary">volunteers: {currentVolunteers}</span>
                                    <span className="badge badge-accent">participants: {currentParticipants}</span>
                                </div>

                                <div className="mt-4 flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        className="btn btn-primary"
                                        onClick={() => currentId && router.push(`/incidents/${currentId}`)}
                                    >
                                        Open Incident Workspace
                                    </button>
                                </div>
                                        </>
                                    );
                                })()}
                            </>
                        ) : (
                            <div className="alert alert-info">
                                <span>Open your assigned incident from the dedicated workspace view.</span>
                            </div>
                        )}
                    </div>
                </section>
            )}

            {!checkingActiveIncident && (!enforceAssignedLock || !hasActiveIncident) && (
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <article className="card bg-base-100 shadow-lg border border-base-300">
                    <div className="card-body">
                        <h2 className="card-title">Create Incident</h2>

                        {error && (
                            <div className="alert alert-error">
                                <span>{error}</span>
                            </div>
                        )}

                        {currentRole !== "victim" ? (
                            <div className="alert alert-info">
                                <span>Incident creation is limited to victim role. Use join/assign for participation.</span>
                            </div>
                        ) : checkingActiveIncident ? (
                            <div className="py-2">
                                <span className="loading loading-spinner loading-md"></span>
                            </div>
                        ) : hasActiveIncident ? (
                            <div className="alert alert-warning">
                                <div>
                                    <div className="font-semibold">You already have an active incident.</div>
                                    <div className="text-sm">Resolve it before creating another one.</div>
                                    {activeIncidentId && (
                                        <button
                                            type="button"
                                            className="btn btn-sm btn-outline mt-3"
                                            onClick={() => router.push(`/incidents/${activeIncidentId}`)}
                                        >
                                            View Active Incident
                                        </button>
                                    )}
                                </div>
                            </div>
                        ) : (
                        <form onSubmit={onSubmit} className="space-y-3">
                            <input
                                type="text"
                                className="input input-bordered w-full"
                                placeholder="Title"
                                value={form.title}
                                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                                required
                            />

                            <textarea
                                className="textarea textarea-bordered w-full"
                                placeholder="Description"
                                value={form.description}
                                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                                rows={4}
                                required
                            />

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <input
                                    type="text"
                                    className="input input-bordered"
                                    placeholder="Category"
                                    value={form.category}
                                    onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                                />

                                <select
                                    className="select select-bordered"
                                    value={form.severity}
                                    onChange={(e) => setForm((prev) => ({ ...prev, severity: e.target.value }))}
                                >
                                    {severities.map((item) => (
                                        <option key={item} value={item}>
                                            {item}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <button type="submit" className="btn btn-primary" disabled={creating}>
                                {creating ? "Creating..." : "Create Incident"}
                            </button>
                        </form>
                        )}
                    </div>
                </article>

                <article className="card bg-base-100 shadow-lg border border-base-300">
                    <div className="card-body">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                            <h2 className="card-title">Incident Feed</h2>

                            <div className="flex gap-2 flex-wrap">
                                <select
                                    className="select select-bordered"
                                    value={severity}
                                    onChange={(e) => {
                                        setPage(1);
                                        setSeverity(e.target.value);
                                    }}
                                >
                                    <option value="">All Severities</option>
                                    {severities.map((item) => (
                                        <option key={item} value={item}>
                                            {item}
                                        </option>
                                    ))}
                                </select>

                                <select
                                    className="select select-bordered"
                                    value={status}
                                    onChange={(e) => {
                                        setPage(1);
                                        setStatus(e.target.value);
                                    }}
                                >
                                    <option value="">All Status</option>
                                    <option value="active">active</option>
                                    <option value="closed">closed</option>
                                </select>
                            </div>
                        </div>

                        {loading ? (
                            <div className="py-6">
                                <span className="loading loading-spinner loading-md"></span>
                            </div>
                        ) : incidents.length === 0 ? (
                            <p className="text-base-content/70">No incidents found.</p>
                        ) : (
                            <div className="space-y-2">
                                {incidents.map((incident, index) => {
                                    const incidentId = incident?._id || incident?.id;
                                    const { victims, volunteers, participants } = getIncidentCounts(incident);
                                    const isCurrentlyAssignedIncident = Boolean(
                                        assignedIncidentId && incidentId && assignedIncidentId === incidentId
                                    );
                                    const joinBlockedByExistingAssignment = Boolean(
                                        assignedIncidentId && incidentId && assignedIncidentId !== incidentId
                                    );

                                    return (
                                    <div
                                        key={incidentId || `${incident?.title || "incident"}-${index}`}
                                        className="w-full text-left rounded-xl border border-base-300 p-3 hover:bg-base-200 transition"
                                    >
                                        <div className="flex justify-between items-start gap-2">
                                            <h3 className="font-semibold">{incident.title}</h3>
                                            <span className="badge badge-outline">{incident.severity}</span>
                                        </div>
                                        <p className="text-sm text-base-content/70 mt-1 line-clamp-2">{incident.description}</p>
                                        <div className="text-xs text-base-content/60 mt-2">Status: {incident.status}</div>
                                        <div className="flex gap-2 flex-wrap mt-2">
                                            <span className="badge badge-primary badge-sm">Victims: {victims}</span>
                                            <span className="badge badge-secondary badge-sm">Volunteers: {volunteers}</span>
                                            <span className="badge badge-accent badge-sm">Participants: {participants}</span>
                                        </div>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                className="btn btn-sm btn-outline"
                                                onClick={() => incidentId && router.push(`/incidents/${incidentId}`)}
                                            >
                                                View
                                            </button>
                                            {(currentRole === "victim" || currentRole === "volunteer" || currentRole === "admin") && incident.status === "active" && incidentId && !isCurrentlyAssignedIncident && (
                                                <button
                                                    type="button"
                                                    className="btn btn-sm btn-primary"
                                                    onClick={() => onJoin(incidentId)}
                                                    disabled={loading || joinBlockedByExistingAssignment}
                                                >
                                                    {joinBlockedByExistingAssignment ? "Assigned Elsewhere" : "Join"}
                                                </button>
                                            )}

                                            {incident.status === "active" && isCurrentlyAssignedIncident && (
                                                <div className="badge badge-success badge-outline">
                                                    Currently assigned to this incident
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )})}
                            </div>
                        )}

                        <div className="flex items-center justify-between mt-4">
                            <button
                                className="btn btn-outline btn-sm"
                                disabled={!canGoPrev || loading}
                                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                            >
                                Previous
                            </button>
                            <span className="text-sm text-base-content/70">
                                Page {meta?.page || page} / {meta?.totalPages || 1}
                            </span>
                            <button
                                className="btn btn-outline btn-sm"
                                disabled={!canGoNext || loading}
                                onClick={() => setPage((prev) => prev + 1)}
                            >
                                Next
                            </button>
                        </div>
                    </div>
                </article>
            </section>
            )}

        </div>
    );
}
