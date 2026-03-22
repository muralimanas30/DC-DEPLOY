"use client";
import PropTypes from "prop-types";

/**
 * LocationMap
 * Shows a scrollable, zoomable map with multiple markers (visual overlay only).
 * Props:
 *   markers: [{ lng, lat, label, type }]
 *   center: { lng, lat }
 */
export default function LocationMap({ markers = [], center }) {
    // Default center: first marker or [0,0]
    const mapCenter = center || (markers[0] ? { lng: markers[0].lng, lat: markers[0].lat } : { lng: 0, lat: 0 });

    // For demo: overlay colored dots at center (not accurate, but works for simple display)
    return (
        <div className="w-full h-64 overflow-hidden rounded-lg relative">
            <iframe
                title="Incident Map"
                width="100%"
                height="100%"
                style={{ minHeight: "16rem", border: 0 }}
                loading="lazy"
                allowFullScreen
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${mapCenter.lng-0.01},${mapCenter.lat-0.01},${mapCenter.lng+0.01},${mapCenter.lat+0.01}&layer=mapnik&marker=${mapCenter.lat},${mapCenter.lng}`}
            ></iframe>
            {/* Overlay markers for each victim/volunteer (visual only, not interactive) */}
            <div className="absolute inset-0 pointer-events-none">
                {markers.map((m, idx) => {
                    // victims=red, volunteers=blue, user=green
                    let color = m.type === "victim" ? "bg-red-500" : m.type === "volunteer" ? "bg-blue-500" : "bg-green-500";
                    // For demo, stack dots at center
                    return (
                        <div
                            key={idx}
                            className={`absolute left-1/2 top-1/2 w-4 h-4 rounded-full border-2 border-white ${color}`}
                            style={{ transform: `translate(-50%, -50%) scale(${1 + idx * 0.2})` }}
                            title={m.label}
                        ></div>
                    );
                })}
            </div>
        </div>
    );
}
