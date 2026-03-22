'use client';
import { useState, useEffect } from 'react';
import useRouterWithEvents from 'use-router-with-events';
import Loader from '@/components/Loader';
export default function RouteLoader() {
    const router = useRouterWithEvents();
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const { events } = router;

        events.onRouteStart = () => setLoading(true);
        events.onRouteComplete = () => setLoading(false);
        events.onRouteError = () => setLoading(false);

        return () => {
            events.onRouteStart = null;
            events.onRouteComplete = null;
            events.onRouteError = null;
        };
    }, [router]);

    return loading ? <Loader /> : null;
}