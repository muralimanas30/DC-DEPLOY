"use client";

import { useCallback, useState } from "react";

const initialMeta = {
	page: 1,
	limit: 10,
	total: 0,
	totalPages: 1,
};

function normalizeIncidentId(value) {
	if (!value) return null;
	if (typeof value === "string") return value;
	if (typeof value === "object") {
		return value._id || value.id || value.incidentId || null;
	}
	return null;
}

export default function useIncident() {
	const [incidents, setIncidents] = useState([]);
	const [selectedIncident, setSelectedIncident] = useState(null);
	const [meta, setMeta] = useState(initialMeta);
	const [loading, setLoading] = useState(false);
	const [creating, setCreating] = useState(false);
	const [error, setError] = useState("");

	const listIncidents = useCallback(async (query = {}) => {
		setLoading(true);
		setError("");

		try {
			const search = new URLSearchParams();
			Object.entries(query).forEach(([key, value]) => {
				if (value !== undefined && value !== null && value !== "") {
					search.set(key, String(value));
				}
			});

			const res = await fetch(`/api/incidents?${search.toString()}`, {
				method: "GET",
			});

			const payload = await res.json();

			if (!res.ok || payload?.status !== "success") {
				throw new Error(payload?.msg || "Failed to fetch incidents");
			}

			setIncidents(payload?.data?.incidents || []);
			setMeta(payload?.meta || initialMeta);
			return payload;
		} catch (err) {
			const message = err?.message || "Failed to fetch incidents";
			setError(message);
			return null;
		} finally {
			setLoading(false);
		}
	}, []);

	const getIncidentById = useCallback(async (incidentId) => {
		if (!incidentId) return null;

		setLoading(true);
		setError("");

		try {
			const res = await fetch(`/api/incidents/${incidentId}`, {
				method: "GET",
			});
			const payload = await res.json();

			if (!res.ok || payload?.status !== "success") {
				throw new Error(payload?.msg || "Failed to fetch incident details");
			}

			const incident = payload?.data?.incident || null;
			setSelectedIncident(incident);
			return incident;
		} catch (err) {
			const message = err?.message || "Failed to fetch incident details";
			setError(message);
			return null;
		} finally {
			setLoading(false);
		}
	}, []);

	const createIncident = useCallback(async (body) => {
		setCreating(true);
		setError("");

		try {
			const res = await fetch("/api/incidents", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(body),
			});

			const payload = await res.json();

			if (!res.ok || payload?.status !== "success") {
				throw new Error(payload?.msg || "Failed to create incident");
			}

			return payload?.data?.incident || null;
		} catch (err) {
			const message = err?.message || "Failed to create incident";
			setError(message);
			return null;
		} finally {
			setCreating(false);
		}
	}, []);

	const resolveIncident = useCallback(async (incidentId) => {
		const normalizedIncidentId = normalizeIncidentId(incidentId);
		if (!normalizedIncidentId) return null;

		setLoading(true);
		setError("");

		try {
			const res = await fetch(`/api/incidents/${normalizedIncidentId}/resolve`, {
				method: "PATCH",
			});

			const payload = await res.json();

			if (!res.ok || payload?.status !== "success") {
				throw new Error(payload?.msg || "Failed to resolve incident");
			}

			const incident = payload?.data?.incident || null;
			setSelectedIncident(incident);
			return incident;
		} catch (err) {
			const message = err?.message || "Failed to resolve incident";
			setError(message);
			return null;
		} finally {
			setLoading(false);
		}
	}, []);

	const requestIncidentMutation = useCallback(async (url, options, fallbackMessage) => {
		setLoading(true);
		setError("");

		try {
			const res = await fetch(url, options);
			const payload = await res.json();

			if (!res.ok || payload?.status !== "success") {
				throw new Error(payload?.msg || fallbackMessage);
			}

			const incident = payload?.data?.incident || null;
			if (incident) {
				setSelectedIncident(incident);
			}

			return incident;
		} catch (err) {
			const message = err?.message || fallbackMessage;
			setError(message);
			return null;
		} finally {
			setLoading(false);
		}
	}, []);

	const joinIncident = useCallback(async (incidentId) => {
		if (!incidentId) return null;

		return requestIncidentMutation(
			`/api/incidents/${incidentId}/join`,
			{ method: "POST" },
			"Failed to join incident"
		);
	}, [requestIncidentMutation]);

	const leaveIncident = useCallback(async (incidentId) => {
		if (!incidentId) return null;

		return requestIncidentMutation(
			`/api/incidents/${incidentId}/leave`,
			{ method: "POST" },
			"Failed to leave incident"
		);
	}, [requestIncidentMutation]);

	const assignUser = useCallback(async (incidentId, userId) => {
		if (!incidentId || !userId) return null;

		return requestIncidentMutation(
			`/api/incidents/${incidentId}/assign`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ userId }),
			},
			"Failed to assign user"
		);
	}, [requestIncidentMutation]);

	const unassignUser = useCallback(async (incidentId, userId) => {
		if (!incidentId || !userId) return null;

		return requestIncidentMutation(
			`/api/incidents/${incidentId}/assign/${userId}`,
			{ method: "DELETE" },
			"Failed to unassign user"
		);
	}, [requestIncidentMutation]);

	return {
		incidents,
		selectedIncident,
		meta,
		loading,
		creating,
		error,
		clearError: () => setError(""),
		listIncidents,
		getIncidentById,
		createIncident,
		resolveIncident,
		joinIncident,
		leaveIncident,
		assignUser,
		unassignUser,
	};
}
