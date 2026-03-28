import { useEffect, useState } from "react";

export default function useCurrentLocation() {
    const [location, setLocation] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (typeof window === "undefined" || typeof navigator === "undefined") {
            return;
        }

        if (!window.isSecureContext) {
            setError("Location requires HTTPS (or localhost). Continue without location or use a secure URL.");
            return;
        }

        if (!("geolocation" in navigator)) {
            setError("Geolocation not supported on this device/browser");
            return;
        }

        setError(null);

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setLocation({
                    type: "Point",
                    coordinates: [pos.coords.longitude, pos.coords.latitude]
                });
                setError(null);
            },
            (err) => {
                const message = err?.message || "Unable to access location";
                setError(message);
            },
            { enableHighAccuracy: true }
        );
    }, []);

    return { location, error };
}
