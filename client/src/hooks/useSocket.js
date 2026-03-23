import { io } from "socket.io-client";

// Singleton socket instance and listeners
let socket = null;
const listeners = {};

const getSocketBaseUrl = () => {
    return process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
};

/**
 * Connects the socket with the given token.
 * Registers all listeners from the listeners object.
 */
export function connectSocket(token) {
    if (!token || typeof token !== "string" || token.length < 10) return null;

    if (!socket) {
        socket = io(getSocketBaseUrl(), {
            autoConnect: false,
            auth: { token },
            withCredentials: true,
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
        });

        // Rebind existing subscriptions when socket instance is recreated.
        Object.entries(listeners).forEach(([event, callbacks]) => {
            callbacks.forEach((cb) => {
                socket.off(event, cb);
                socket.on(event, cb);
            });
        });

        socket.on("connect", () => {
        });

        socket.on("connect_error", (err) => {
        });

        socket.on("disconnect", (reason) => {
        });

        socket.connect();
        return socket;
    }

    // If socket exists but token changed, update auth and reconnect.
    if (socket.auth?.token !== token) {
        socket.auth = { token };
        if (socket.connected) socket.disconnect();
    }

    if (!socket.connected) {
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
        if (socket) {
            socket.off(event, callback);
            socket.on(event, callback);
        }
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

export function isSocketConnected() {
    return Boolean(socket && socket.connected);
}
