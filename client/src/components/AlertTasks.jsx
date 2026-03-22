"use client";
/**
 * AlertTasks
 * Allows volunteers to send quick incident alerts (e.g., "Come to me", "Stay together") to all users in the incident.
 * Displays incoming alerts as chat messages and toast notifications.
 */
import { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { getSocket } from "../hooks/useSocket";
import { addSocketChatMessage } from "../store/slices/incidentSlice";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const ALERT_TYPES = [
    { type: "comeToMe", label: "Come to Me", color: "btn-primary" },
    { type: "stayTogether", label: "Stay Together", color: "btn-accent" },
    // Add more alert types as needed
];

export default function AlertTasks({ incidentId }) {
    const dispatch = useDispatch();
    const user = useSelector((state) => state.user.user);
    const socket = getSocket();

    // Listen for incoming alerts and show toast + chat message
    useEffect(() => {
        if (!socket) return;
        const handleAlert = (alert) => {
            // Show toast notification
            toast.info(alert.message, {
                position: "top-center",
                autoClose: 3000,
                theme: "colored",
            });
            // Optionally add to chat/messages
            dispatch(addSocketChatMessage({
                _id: `alert-${alert.timestamp}`,
                sender: { name: alert.name, role: alert.role, _id: alert.userId },
                message: `[ALERT] ${alert.message}`,
                sentAt: alert.timestamp,
                isAlert: true,
            }));
        };
        socket.on("incidentAlert", handleAlert);
        return () => {
            socket.off("incidentAlert", handleAlert);
        };
    }, [socket, dispatch, user?._id]);

    // Send alert to backend
    const sendAlert = (alertType) => {
        if (!socket || !incidentId || !user) return;
        console.log("[AlertTasks] Sending alert:", alertType);
        if (socket.connected) {
            console.log("[AlertTasks] Socket is connected:", socket.id);
        } else {
            console.warn("[AlertTasks] Socket is NOT connected");
        }
        socket.emit("sendAlert", {
            userId: user._id,
            incidentId,
            alertType,
        });
    };

    // Only volunteers can send alerts
    if (!user || user.role !== "volunteer") return null;

    return (
        <div className="card bg-base-200 shadow-xl my-6">
            <div className="card-body">
                <h3 className="card-title text-lg mb-2">Quick Alert Tasks</h3>
                <div className="flex flex-wrap gap-2 mb-2">
                    {ALERT_TYPES.map((alert) => (
                        <button
                            key={alert.type}
                            className={`btn ${alert.color} btn-sm`}
                            onClick={() => sendAlert(alert.type)}
                        >
                            {alert.label}
                        </button>
                    ))}
                </div>
                <div className="text-xs opacity-70">
                    These alerts will be sent to all users in this incident and shown in chat.
                </div>
            </div>
        </div>
    );
}