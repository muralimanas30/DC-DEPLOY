'use client';
import { useState, useEffect } from 'react';
import useRouterWithEvents from 'use-router-with-events';
import Loader from '@/components/Loader';
export default function RouteLoader() {
    const router = useRouterWithEvents();
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const { events } = router;
        const handleRouteStart = () => setLoading(true);
        const handleRouteDone = () => setLoading(false);

        events.on("routeStart", handleRouteStart);
        events.on("routeComplete", handleRouteDone);
        events.on("routeError", handleRouteDone);

        return () => {
            events.off("routeStart");
            events.off("routeComplete");
            events.off("routeError");
        };
    }, [router]);

    return loading ? <Loader /> : null;
}