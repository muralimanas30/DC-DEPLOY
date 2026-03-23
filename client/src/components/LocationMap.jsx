"use client";
import PropTypes from "prop-types";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";

function normalizeCenter(markers, center) {
    if (center && Number.isFinite(center.lng) && Number.isFinite(center.lat)) {
        return [center.lat, center.lng];
    }

    const first = markers.find((marker) => Number.isFinite(marker?.lat) && Number.isFinite(marker?.lng));
    if (first) {
        return [first.lat, first.lng];
    }

    return [20, 0];
}

function getMarkerColor(type) {
    if (type === "incident") return "#ef4444";
    if (type === "self") return "#2563eb";
    if (type === "victim") return "#f97316";
    if (type === "volunteer") return "#16a34a";
    if (type === "admin") return "#9333ea";
    return "#6b7280";
}

function createMarkerIcon(type) {
    const color = getMarkerColor(type);
    return L.divIcon({
        className: "",
        html: `<span style="display:block;width:14px;height:14px;border-radius:999px;border:2px solid #fff;background:${color};box-shadow:0 0 0 2px rgba(0,0,0,0.22)"></span>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
        popupAnchor: [0, -8],
    });
}

function FitBounds({ markers }) {
    const map = useMap();

    if (!markers.length) {
        return null;
    }

    const points = markers
        .filter((marker) => Number.isFinite(marker?.lat) && Number.isFinite(marker?.lng))
        .map((marker) => [marker.lat, marker.lng]);

    if (!points.length) {
        return null;
    }

    if (points.length === 1) {
        map.setView(points[0], 13);
        return null;
    }

    map.fitBounds(points, { padding: [36, 36] });
    return null;
}

/**
 * LocationMap
 * Interactive map with colored markers and detail popups.
 * Props:
 *   markers: [{ id, lng, lat, label, type, title, details, href }]
 *   center: { lng, lat }
 */
export default function LocationMap({ markers = [], center }) {
    const validMarkers = markers.filter((marker) => Number.isFinite(marker?.lat) && Number.isFinite(marker?.lng));
    const mapCenter = normalizeCenter(validMarkers, center);

    return (
        <div className="w-full h-[70vh] overflow-hidden rounded-xl border border-base-300">
            <MapContainer center={mapCenter} zoom={13} className="h-full w-full" scrollWheelZoom>
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <FitBounds markers={validMarkers} />

                {validMarkers.map((marker, index) => (
                    <Marker
                        key={marker.id || `${marker.type || "m"}:${marker.lat}:${marker.lng}:${index}`}
                        position={[marker.lat, marker.lng]}
                        icon={createMarkerIcon(marker.type)}
                    >
                        <Popup>
                            <div className="min-w-55 space-y-1">
                                <div className="font-semibold text-sm">{marker.title || marker.label || "Map marker"}</div>
                                {marker.label ? <div className="text-xs opacity-80">{marker.label}</div> : null}
                                {Array.isArray(marker.details) && marker.details.length > 0 ? (
                                    <ul className="text-xs opacity-80 list-disc list-inside">
                                        {marker.details.map((item) => (
                                            <li key={item}>{item}</li>
                                        ))}
                                    </ul>
                                ) : null}
                                {marker.href ? (
                                    <a className="link link-primary text-xs" href={marker.href}>
                                        Open details
                                    </a>
                                ) : null}
                            </div>
                        </Popup>
                    </Marker>
                ))}
            </MapContainer>
        </div>
    );
}

LocationMap.propTypes = {
    markers: PropTypes.arrayOf(
        PropTypes.shape({
            id: PropTypes.string,
            lng: PropTypes.number,
            lat: PropTypes.number,
            label: PropTypes.string,
            title: PropTypes.string,
            type: PropTypes.string,
            details: PropTypes.arrayOf(PropTypes.string),
            href: PropTypes.string,
        })
    ),
    center: PropTypes.shape({
        lng: PropTypes.number,
        lat: PropTypes.number,
    }),
};
