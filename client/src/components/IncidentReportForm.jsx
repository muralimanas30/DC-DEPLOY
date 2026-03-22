"use client";
/**
 * IncidentReportForm
 * Allows victim to report a new incident if none is active.
 */
import { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { createIncidentThunk, getIncidentReportsThunk, fetchAvailableIncidentsThunk, fetchVictimIncidentsThunk, fetchAssignedIncidentThunk } from "../store/slices/incidentSlice";
import useCurrentLocation from "../hooks/useCurrentLocation";
import Pagination from "./Pagination";
import IncidentMapClient from "./IncidentMapClient";

export default function IncidentReportForm({ incidentId }) {
    const dispatch = useDispatch();
    const { loading, error, success, assignedIncident } = useSelector(s => s.incidents);
    const { user } = useSelector(s => s.user);
    const [form, setForm] = useState({ title: "", description: "" });
    const { location, error: locationError } = useCurrentLocation();
    const [page, setPage] = useState(1);
    const { reports, reportsPagination } = useSelector(state => state.incidents);

    useEffect(() => {
        // Show error if location is not available
        if (!location && !locationError) return;
    }, [location, locationError]);

    useEffect(() => {
        if (incidentId) {
            dispatch(getIncidentReportsThunk({ incidentId, page, limit: 10 }));
        }
    }, [dispatch, incidentId, page]);

    const handleChange = e => {
        setForm(f => ({ ...f, [e.target.name]: e.target.value }));
    };
    
    const handleSubmit = async e => {
        e.preventDefault();
        if (!normalized?.geojson || loading) return;

        // Prevent multiple submissions
        await dispatch(createIncidentThunk({ ...form, location: normalized.geojson }));

        // On success, refresh all incident-related state except user details
        if (!error) {
            if (user?._id) {
                dispatch(fetchAssignedIncidentThunk(user._id));
                dispatch(fetchVictimIncidentsThunk({ userId: user._id, page: 1, limit: 10 }));
            }
            dispatch(fetchAvailableIncidentsThunk({ page: 1, limit: 10 }));
            setForm({ title: "", description: "" });
        }
    };

    // --- normalize location (supports GeoJSON + {lat,lng} + {latitude,longitude}) ---
    const normalized = (() => {
        if (!location || typeof location !== "object") return null;

        // GeoJSON Point: { type:"Point", coordinates:[lng,lat] }
        if (
            location.type === "Point" &&
            Array.isArray(location.coordinates) &&
            location.coordinates.length === 2 &&
            Number.isFinite(location.coordinates[0]) &&
            Number.isFinite(location.coordinates[1])
        ) {
            return {
                geojson: location,
                lat: location.coordinates[1],
                lng: location.coordinates[0],
            };
        }

        // Plain object: {lat,lng}
        if (Number.isFinite(location.lat) && Number.isFinite(location.lng)) {
            return {
                geojson: { type: "Point", coordinates: [location.lng, location.lat] },
                lat: location.lat,
                lng: location.lng,
            };
        }

        // Plain object: {latitude,longitude}
        if (Number.isFinite(location.latitude) && Number.isFinite(location.longitude)) {
            return {
                geojson: { type: "Point", coordinates: [location.longitude, location.latitude] },
                lat: location.latitude,
                lng: location.longitude,
            };
        }

        return null;
    })();

    const hasCoords = !!normalized;

    return (
        <div className="flex flex-col lg:flex-row gap-6">
            <form className="card bg-base-200 shadow-xl max-w-lg mx-auto p-6 flex-1" onSubmit={handleSubmit}>
                <h2 className="card-title text-xl mb-4">Report a New Incident</h2>
                {error && <div className="alert alert-error mb-2">{error}</div>}
                {success && <div className="alert alert-success mb-2">{success}</div>}
                {locationError && <div className="alert alert-error mb-2">{locationError}</div>}
                <input
                    className="input input-bordered w-full mb-2"
                    name="title"
                    placeholder="Incident Title"
                    value={form.title}
                    onChange={handleChange}
                    required
                    autoFocus
                />
                <textarea
                    className="textarea textarea-bordered w-full mb-2"
                    name="description"
                    placeholder="Describe the incident"
                    value={form.description}
                    onChange={handleChange}
                    required
                />
                <div className="mb-2">
                    <label className="label">Your Location</label>
                    <input
                        className="input input-bordered w-full"
                        value={
                            normalized
                                ? `${normalized.lat}, ${normalized.lng}`
                                : "Fetching location..."
                        }
                        disabled
                    />
                </div>
                <button
                    type="submit"
                    className="btn btn-primary w-full"
                    disabled={loading || !normalized?.geojson}
                >
                    {loading ? "Reporting..." : "Report Incident"}
                </button>
            </form>

            <div className="w-full lg:w-80 flex items-center justify-center">
                {hasCoords ? (
                    <IncidentMapClient
                        center={normalized.geojson}
                        markers={[
                            { lat: normalized.lat, lng: normalized.lng, label: "You", type: "victim", userId: user?._id }
                        ]}
                        selfUserId={user?._id}
                    />
                ) : (
                    <div className="alert alert-info flex items-center gap-2">
                        <span className="loading loading-spinner loading-sm"></span>
                        <span>Fetching location...</span>
                    </div>
                )}

                {locationError && (
                    <div className="alert alert-error mt-2">{locationError}</div>
                )}
            </div>

            <Pagination pagination={reportsPagination} onPageChange={setPage} />
        </div>
    );
}
