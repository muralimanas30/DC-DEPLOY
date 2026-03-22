import { useEffect, useState } from "react";

export default function useCurrentLocation() {
    const [location, setLocation] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!("geolocation" in navigator)) {
            setError("Geolocation not supported");
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
