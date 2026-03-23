"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { connectSocket, getSocket, subscribeSocketEvent, unsubscribeSocketEvent } from "@/hooks/useSocket";
import { SOCKET_EVENTS } from "@/lib/realtime";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const ALERT_OPTIONS_BY_ROLE = {
    victim: [
        { type: "needHelp", label: "Need Help", tone: "btn-info" },
        { type: "medicalEmergency", label: "Medical Emergency", tone: "btn-error" },
        { type: "trapped", label: "Trapped", tone: "btn-warning" },
        { type: "comeToMe", label: "Come To Me", tone: "btn-primary" },
    ],
    volunteer: [
        { type: "comeToMe", label: "Come To Me", tone: "btn-primary" },
        { type: "stayTogether", label: "Stay Together", tone: "btn-accent" },
        { type: "needBackup", label: "Need Backup", tone: "btn-warning" },
        { type: "routeBlocked", label: "Route Blocked", tone: "btn-error" },
    ],
    admin: [
        { type: "evacuate", label: "Evacuate", tone: "btn-error" },
        { type: "escalate", label: "Escalate", tone: "btn-warning" },
        { type: "standDown", label: "Stand Down", tone: "btn-success" },
        { type: "needBackup", label: "Need Backup", tone: "btn-info" },
        { type: "stayTogether", label: "Stay Together", tone: "btn-accent" },
    ],
};

const ACCESS_ERROR_CODES = new Set([
    "INCIDENT_CLOSED",
    "INCIDENT_CHAT_FORBIDDEN",
    "INCIDENT_CHAT_SEND_FORBIDDEN",
    "INCIDENT_ALERT_FORBIDDEN",
    "INCIDENT_VIEW_FORBIDDEN",
    "UNAUTHORIZED",
]);

function toApiError(payload, fallbackMessage) {
    const err = new Error(payload?.msg || fallbackMessage);
    err.code = payload?.code;
    return err;
}

function normalizeMessage(raw) {
    const createdAt = raw?.createdAt || raw?.timestamp || new Date().toISOString();
    return {
        id: raw?.id || `${raw?.senderId || "unknown"}:${createdAt}`,
        type: raw?.type || "text",
        body: raw?.body || raw?.message || "",
        alertTitle: raw?.alertTitle || raw?.title || null,
        severity: raw?.severity || "low",
        senderId: raw?.senderId || null,
        senderName: raw?.senderName || "Responder",
        senderRole: raw?.senderRole || "victim",
        createdAt,
    };
}

function formatTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "now";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function roleBadge(role) {
    if (role === "admin") return "badge badge-error badge-xs";
    if (role === "volunteer") return "badge badge-success badge-xs";
    return "badge badge-info badge-xs";
}

function alertSurface(severity) {
    if (severity === "critical") return "border-error/50 bg-error/10";
    if (severity === "high") return "border-warning/50 bg-warning/10";
    return "border-info/40 bg-info/10";
}

export default function IncidentChatPage() {
    const params = useParams();
    const router = useRouter();
    const { data: session } = useSession();

    const incidentId = useMemo(() => {
        const raw = params?.incidentId;
        if (typeof raw === "string") return raw;
        if (Array.isArray(raw)) return raw[0] || null;
        return null;
    }, [params?.incidentId]);

    const myId = session?.user?.id ? String(session.user.id) : null;
    const currentRole = session?.user?.activeRole || session?.user?.role || "victim";
    const socketToken = session?.user?.token;

    const [incident, setIncident] = useState(null);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);
    const [loading, setLoading] = useState(true);

    const messageViewportRef = useRef(null);

    const alertOptions = ALERT_OPTIONS_BY_ROLE[currentRole] || ALERT_OPTIONS_BY_ROLE.victim;

    const redirectToIncidents = useCallback((notice) => {
        if (notice) {
            toast.info(notice, { autoClose: 2600 });
        }
        router.replace("/incidents");
    }, [router]);

    const handleAccessFailure = useCallback((errorLike) => {
        const code = errorLike?.code;
        if (!code || !ACCESS_ERROR_CODES.has(code)) {
            return false;
        }

        if (code === "INCIDENT_CLOSED") {
            redirectToIncidents("Incident closed. Chat is no longer available.");
            return true;
        }

        redirectToIncidents("You are no longer assigned to this incident.");
        return true;
    }, [redirectToIncidents]);

    const appendMessage = useCallback((raw) => {
        const message = normalizeMessage(raw);
        const senderId = message?.senderId ? String(message.senderId) : null;

        setMessages((prev) => {
            if (prev.some((item) => item.id === message.id)) return prev;
            const merged = [...prev, message];
            merged.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            return merged;
        });

        if (senderId && myId && senderId !== myId) {
            if (message.type === "alert") {
                toast.warn(`${message.alertTitle || "Alert"} from ${message.senderName}`, { autoClose: 2200 });
            } else {
                toast.info(`New message from ${message.senderName}`, { autoClose: 1600 });
            }
        }
    }, [myId]);

    const ensureAssignedAccess = useCallback(async () => {
        if (!incidentId) return;

        try {
            const res = await fetch("/api/incidents?assignedOnly=true&page=1&limit=1", {
                method: "GET",
                cache: "no-store",
            });
            const payload = await res.json();
            const assigned = payload?.data?.incidents?.[0] || null;
            const assignedId = assigned?._id || assigned?.id || null;

            if (!assignedId || String(assignedId) !== String(incidentId)) {
                redirectToIncidents("You are no longer assigned to this incident.");
            }
        } catch {
        }
    }, [incidentId, redirectToIncidents]);

    const loadIncident = useCallback(async () => {
        if (!incidentId) return;
        const res = await fetch(`/api/incidents/${incidentId}`, { method: "GET", cache: "no-store" });
        const payload = await res.json();
        if (!res.ok || payload?.status !== "success") {
            throw toApiError(payload, "Failed to load incident");
        }
        setIncident(payload?.data?.incident || null);
    }, [incidentId]);

    const loadMessages = useCallback(async () => {
        if (!incidentId) return;

        const res = await fetch(`/api/incidents/${incidentId}/chat?page=1&limit=100`, {
            method: "GET",
            cache: "no-store",
        });
        const payload = await res.json();

        if (!res.ok || payload?.status !== "success") {
            throw toApiError(payload, "Failed to load messages");
        }

        const rows = Array.isArray(payload?.data?.messages) ? payload.data.messages : [];
        const normalized = rows.map(normalizeMessage).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        setMessages(normalized);
    }, [incidentId]);

    useEffect(() => {
        if (!incidentId) return;

        setLoading(true);

        Promise.all([loadIncident(), loadMessages(), ensureAssignedAccess()])
            .catch((err) => {
                if (handleAccessFailure(err)) return;
                toast.error(err?.message || "Failed to load chat workspace");
            })
            .finally(() => setLoading(false));
    }, [incidentId, loadIncident, loadMessages, ensureAssignedAccess, handleAccessFailure]);

    useEffect(() => {
        const viewport = messageViewportRef.current;
        if (!viewport) return;

        const id = requestAnimationFrame(() => {
            viewport.scrollTop = viewport.scrollHeight;
        });

        return () => cancelAnimationFrame(id);
    }, [messages.length]);

    useEffect(() => {
        if (!incidentId || !socketToken) return;

        const socket = connectSocket(socketToken);
        if (!socket) return;

        const watchIncident = () => {
            socket.emit(SOCKET_EVENTS.INCIDENT_WATCH, { incidentId });
        };

        if (socket.connected) watchIncident();
        socket.on("connect", watchIncident);

        const onChatMessage = (payload = {}) => {
            const payloadIncidentId = payload?.incidentId ? String(payload.incidentId) : null;
            if (!payloadIncidentId || payloadIncidentId !== incidentId) return;
            appendMessage(payload);
        };

        const onAlertError = (payload = {}) => {
            if (handleAccessFailure(payload)) return;
            toast.error(payload?.message || "Unable to send alert.");
        };

        const onIncidentClosed = (payload = {}) => {
            const payloadIncidentId = payload?.incidentId ? String(payload.incidentId) : null;
            if (!payloadIncidentId || payloadIncidentId !== incidentId) return;
            redirectToIncidents("Incident closed. Chat is no longer available.");
        };

        const onIncidentChanged = (payload = {}) => {
            const payloadIncidentId = payload?.incidentId ? String(payload.incidentId) : null;
            if (!payloadIncidentId || payloadIncidentId !== incidentId) return;
            ensureAssignedAccess();
        };

        subscribeSocketEvent(SOCKET_EVENTS.INCIDENT_CHAT_MESSAGE, onChatMessage);
        subscribeSocketEvent(SOCKET_EVENTS.INCIDENT_ALERT_ERROR, onAlertError);
        subscribeSocketEvent(SOCKET_EVENTS.INCIDENT_CLOSED, onIncidentClosed);
        subscribeSocketEvent(SOCKET_EVENTS.INCIDENT_CHANGED, onIncidentChanged);

        return () => {
            unsubscribeSocketEvent(SOCKET_EVENTS.INCIDENT_CHAT_MESSAGE, onChatMessage);
            unsubscribeSocketEvent(SOCKET_EVENTS.INCIDENT_ALERT_ERROR, onAlertError);
            unsubscribeSocketEvent(SOCKET_EVENTS.INCIDENT_CLOSED, onIncidentClosed);
            unsubscribeSocketEvent(SOCKET_EVENTS.INCIDENT_CHANGED, onIncidentChanged);
            socket.off("connect", watchIncident);

            const activeSocket = getSocket();
            if (activeSocket && activeSocket.connected) {
                activeSocket.emit(SOCKET_EVENTS.INCIDENT_UNWATCH, { incidentId });
            }
        };
    }, [incidentId, socketToken, appendMessage, ensureAssignedAccess, handleAccessFailure, redirectToIncidents]);

    const onSend = async (event) => {
        event.preventDefault();
        if (!incidentId || sending) return;

        const body = input.trim();
        if (!body) return;

        setSending(true);

        try {
            const res = await fetch(`/api/incidents/${incidentId}/chat`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ body }),
            });

            const payload = await res.json();
            if (!res.ok || payload?.status !== "success") {
                throw toApiError(payload, "Failed to send message");
            }

            const created = payload?.data?.message;
            if (created) appendMessage(created);
            setInput("");
        } catch (err) {
            if (handleAccessFailure(err)) return;
            toast.error(err?.message || "Failed to send message");
        } finally {
            setSending(false);
        }
    };

    const sendAlert = (alertType) => {
        if (!incidentId) return;

        const socket = connectSocket(socketToken);
        if (!socket) {
            toast.error("Realtime connection unavailable. Please wait and try again.");
            return;
        }

        const emitAlert = () => {
            socket.emit(SOCKET_EVENTS.INCIDENT_WATCH, { incidentId });
            socket.emit(SOCKET_EVENTS.SEND_ALERT, {
                incidentId,
                alertType,
            });
        };

        if (socket.connected) {
            emitAlert();
            return;
        }

        socket.once("connect", emitAlert);
        socket.connect();
    };

    return (
        <div className="container mx-auto px-4 py-8 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <h1 className="text-3xl font-bold">Incident Chat</h1>
                    <p className="text-sm text-base-content/70">
                        {incident?.title || "Incident"} - role-aware messaging and alert coordination.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Link href={`/incidents/${incidentId}`} className="btn btn-outline btn-sm">Back to Incident</Link>
                    <Link href="/incidents" className="btn btn-ghost btn-sm">All Incidents</Link>
                </div>
            </div>

            <section className="card bg-base-100 border border-base-300 shadow-lg">
                <div className="card-body space-y-3 py-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <h2 className="card-title text-xl">Quick Alerts</h2>
                        <span className="text-xs text-base-content/70">Send alert signal (click message to expand details)</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {alertOptions.map((option) => (
                            <button
                                key={option.type}
                                type="button"
                                className={`btn btn-xs ${option.tone}`}
                                onClick={() => sendAlert(option.type)}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </div>
            </section>

            <section className="card bg-base-100 border border-base-300 shadow-xl">
                <div className="card-body space-y-3 py-4">
                    <h2 className="card-title text-xl">Conversation</h2>

                    {loading ? (
                        <div className="py-8">
                            <span className="loading loading-spinner loading-lg"></span>
                        </div>
                    ) : (
                        <div ref={messageViewportRef} className="h-[55vh] overflow-y-auto rounded-lg border border-base-300 p-2 space-y-2 bg-base-200/30">
                            {messages.length === 0 ? (
                                <div className="text-xs text-base-content/70 px-1">No messages yet. Start coordination here.</div>
                            ) : (
                                messages.map((msg) => {
                                    const mine = myId && String(msg.senderId) === myId;

                                    if (msg.type === "alert") {
                                        return (
                                            <details key={msg.id} className={`rounded-lg border ${alertSurface(msg.severity)} p-2`}>
                                                <summary className="cursor-pointer list-none flex items-center justify-between gap-2 text-xs">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span className={roleBadge(msg.senderRole)}>{msg.senderRole?.toUpperCase?.() || "ROLE"}</span>
                                                        <span className="font-semibold truncate">{msg.alertTitle || "Alert"}</span>
                                                        <span className="text-base-content/70 truncate">{msg.senderName}</span>
                                                    </div>
                                                    <span className="text-[11px] text-base-content/60">{formatTime(msg.createdAt)}</span>
                                                </summary>
                                                <div className="mt-2 text-xs leading-5 text-base-content/85">
                                                    {msg.body}
                                                </div>
                                            </details>
                                        );
                                    }

                                    return (
                                        <article
                                            key={msg.id}
                                            className={`rounded-lg border p-2 max-w-[72%] ${mine ? "ml-auto bg-primary/10 border-primary/30" : "mr-auto bg-base-100 border-base-300"}`}
                                        >
                                            <div className="flex items-center gap-2 text-[11px] mb-1">
                                                <span className={roleBadge(msg.senderRole)}>{msg.senderRole?.toUpperCase?.() || "ROLE"}</span>
                                                <span className="font-semibold truncate max-w-35">{msg.senderName}</span>
                                                <span className="text-base-content/60">{formatTime(msg.createdAt)}</span>
                                            </div>
                                            <p className="text-xs whitespace-pre-wrap leading-5">{msg.body}</p>
                                        </article>
                                    );
                                })
                            )}
                        </div>
                    )}

                    <form onSubmit={onSend} className="flex gap-2">
                        <input
                            type="text"
                            className="input input-bordered input-sm flex-1"
                            placeholder="Type your message..."
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            maxLength={1200}
                        />
                        <button type="submit" className="btn btn-primary btn-sm" disabled={sending || !input.trim()}>
                            {sending ? "Sending..." : "Send"}
                        </button>
                    </form>
                </div>
            </section>

            <ToastContainer newestOnTop closeOnClick draggable={false} position="top-center" />
        </div>
    );
}
