import { BACKEND_URL } from "@/lib/constants";
import { io } from "socket.io-client";

// Singleton socket instance and listeners
let socket = null;
const listeners = {};

/**
 * Connects the socket with the given token.
 * Registers all listeners from the listeners object.
 */
export function connectSocket(token) {
    if (!token || typeof token !== "string" || token.length < 10) return null;

    if (!socket) {
        socket = io(BACKEND_URL, { auth: { token } });

        socket.on("connect", () => {
            console.log("[useSocket] Socket connected:", socket.id);
            Object.entries(listeners).forEach(([event, callbacks]) => {
                callbacks.forEach((cb) => socket.on(event, cb));
            });
        });

        socket.on("connect_error", (err) => {
            console.error("[useSocket] Socket connection error:", err);
        });

        return socket;
    }

    // If socket exists but token changed, update auth and reconnect
    if (socket.auth?.token !== token) {
        socket.auth = { token };
        if (socket.connected) {
            socket.disconnect();
        }
        socket.connect();
    }

    return socket;
}

/**
 * Disconnects and cleans up the socket.
 */
export function disconnectSocket() {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
}

/**
 * Subscribe to a socket event globally.
 * @param {string} event
 * @param {function} callback
 */
export function subscribeSocketEvent(event, callback) {
    if (!listeners[event]) listeners[event] = [];

    // prevent duplicate registrations of same callback
    if (!listeners[event].includes(callback)) {
        listeners[event].push(callback);
        if (socket) socket.on(event, callback);
    }
}

/**
 * Unsubscribe from a socket event globally.
 * @param {string} event
 * @param {function} callback
 */
export function unsubscribeSocketEvent(event, callback) {
    if (listeners[event]) {
        listeners[event] = listeners[event].filter(cb => cb !== callback);
    }
    if (socket) socket.off(event, callback);
}

/**
 * Returns the current socket instance.
 */
export function getSocket() {
    return socket;
}

// Eagerly connect if token already exists (page refresh / direct navigation)
if (typeof window !== "undefined") {
    const existingToken = sessionStorage.getItem("token");
    if (existingToken && existingToken.length >= 10) {
        // use the same code path to avoid double sockets / inconsistent auth
        connectSocket(existingToken);
    }
}
