export function resolveBackendBaseUrl() {
    const explicit = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL;
    if (explicit) {
        return explicit.replace(/\/+$/, "");
    }

    if (process.env.NODE_ENV !== "production") {
        return "http://localhost:8000";
    }

    throw new Error("Missing BACKEND_URL or NEXT_PUBLIC_BACKEND_URL for production runtime");
}
