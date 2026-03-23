"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { getSocket, subscribeSocketEvent, unsubscribeSocketEvent } from "@/hooks/useSocket";
import { SOCKET_EVENTS } from "@/lib/realtime";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const ROLE_ALERT_STYLES = {
    admin: {
        card: "border-error/40 bg-error/10",
        badge: "badge badge-error",
        label: "ADMIN",
    },
    victim: {
        card: "border-info/40 bg-info/10",
        badge: "badge badge-info",
        label: "VICTIM",
    },
    volunteer: {
        card: "border-success/40 bg-success/10",
        badge: "badge badge-success",
        label: "VOLUNTEER",
    },
};

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

function getRoleStyle(role) {
    return ROLE_ALERT_STYLES[role] || ROLE_ALERT_STYLES.victim;
}

function formatAlertTime(timestamp) {
    if (!timestamp) return "now";
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return "now";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function AlertTasks({ incidentId, canSendAlerts = false, currentRole = "victim" }) {
    const { data: session } = useSession();
    const [alerts, setAlerts] = useState([]);

    const role = currentRole || session?.user?.activeRole || session?.user?.role || "victim";
    const alertOptions = useMemo(() => ALERT_OPTIONS_BY_ROLE[role] || ALERT_OPTIONS_BY_ROLE.victim, [role]);

    const appendAlert = useCallback((incoming = {}) => {
        const next = {
            id: incoming?.id || `alert:${incoming?.incidentId || incidentId}:${incoming?.senderId || "unknown"}:${incoming?.timestamp || Date.now()}`,
            incidentId: incoming?.incidentId ? String(incoming.incidentId) : null,
            title: incoming?.title || "Alert",
            message: incoming?.message || "Attention required.",
            severity: incoming?.severity || "medium",
            senderId: incoming?.senderId || null,
            senderName: incoming?.senderName || "Responder",
            senderRole: incoming?.senderRole || "victim",
            timestamp: incoming?.timestamp || new Date().toISOString(),
        };

        setAlerts((prev) => {
            if (prev.some((item) => item.id === next.id)) {
                return prev;
            }
            return [next, ...prev].slice(0, 25);
        });
    }, [incidentId]);

    useEffect(() => {
        if (!incidentId) return;

        const onIncidentAlert = (payload = {}) => {
            const payloadIncidentId = payload?.incidentId ? String(payload.incidentId) : null;
            if (!payloadIncidentId || payloadIncidentId !== incidentId) return;

            appendAlert(payload);
            const senderLabel = payload?.senderName || "Responder";
            const title = payload?.title || "Alert";
            const message = payload?.message || "Attention required.";
            toast.info(`${title}: ${message} (${senderLabel})`, {
                position: "top-center",
                autoClose: 3500,
                theme: "colored",
            });
        };

        const onAlertError = (payload = {}) => {
            toast.error(payload?.message || "Unable to send alert right now.", {
                position: "top-center",
                autoClose: 3500,
            });
        };

        subscribeSocketEvent(SOCKET_EVENTS.INCIDENT_ALERT, onIncidentAlert);
        subscribeSocketEvent(SOCKET_EVENTS.INCIDENT_ALERT_ERROR, onAlertError);

        return () => {
            unsubscribeSocketEvent(SOCKET_EVENTS.INCIDENT_ALERT, onIncidentAlert);
            unsubscribeSocketEvent(SOCKET_EVENTS.INCIDENT_ALERT_ERROR, onAlertError);
        };
    }, [incidentId, appendAlert]);

    const sendAlert = useCallback((alertType) => {
        if (!incidentId) return;

        const socket = getSocket();
        if (!socket || !socket.connected) {
            toast.error("Realtime connection unavailable. Please wait and try again.");
            return;
        }

        socket.emit(SOCKET_EVENTS.SEND_ALERT, {
            incidentId,
            alertType,
        });
    }, [incidentId]);

    return (
        <section className="card bg-base-100 border border-base-300 shadow-lg">
            <div className="card-body space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <h3 className="card-title">Incident Alerts</h3>
                    <span className="text-xs text-base-content/70">Realtime role-aware signal feed</span>
                </div>

                {canSendAlerts ? (
                    <div className="flex flex-wrap gap-2">
                        {alertOptions.map((option) => (
                            <button
                                key={option.type}
                                type="button"
                                className={`btn btn-sm ${option.tone}`}
                                onClick={() => sendAlert(option.type)}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="alert alert-info text-sm">
                        <span>Only active incident participants can raise alerts.</span>
                    </div>
                )}

                {alerts.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-base-300 p-4 text-sm text-base-content/70">
                        No alerts yet. Use quick alerts to broadcast a realtime signal.
                    </div>
                ) : (
                    <div className="space-y-3">
                        {alerts.map((alert) => {
                            const roleStyle = getRoleStyle(alert.senderRole);
                            return (
                                <article key={alert.id} className={`rounded-xl border p-4 ${roleStyle.card}`}>
                                    <div className="text-center text-[11px] font-black tracking-[0.2em] uppercase mb-2">
                                        Alert Signal
                                    </div>
                                    <div className="text-center font-semibold text-base mb-2">
                                        {alert.title}
                                    </div>
                                    <p className="text-sm text-base-content/90 text-center">{alert.message}</p>
                                    <div className="mt-3 flex items-center justify-between gap-2 text-xs">
                                        <span className={roleStyle.badge}>{roleStyle.label}</span>
                                        <span className="font-medium">{alert.senderName}</span>
                                        <span className="text-base-content/70">{formatAlertTime(alert.timestamp)}</span>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                )}
            </div>

            <ToastContainer newestOnTop closeOnClick draggable={false} />
        </section>
    );
}
