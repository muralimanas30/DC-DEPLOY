import { useEffect, useState } from "react";

export default function useCurrentLocation() {
    const [location, setLocation] = useState(null);
    const [error, setError] = useState(() => {
        if (typeof navigator === "undefined") return null;
        return "geolocation" in navigator ? null : "Geolocation not supported";
    });

    useEffect(() => {
        if (typeof navigator === "undefined") {
            return;
        }

        if (!("geolocation" in navigator)) {
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setLocation({
                    type: "Point",
                    coordinates: [pos.coords.longitude, pos.coords.latitude]
                });
            },
            (err) => setError(err.message),
            { enableHighAccuracy: true }
        );
    }, []);

    return { location, error };
}
