"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

export default function ProfilePage() {
    const { data: session, status, update } = useSession();
    const [activeRole, setActiveRole] = useState("");
    const [skillInput, setSkillInput] = useState("");
    const [skills, setSkills] = useState([]);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    const user = session?.user || null;
    const allRoles = useMemo(() => ["victim", "volunteer", "admin"], []);

    const currentRole = user?.activeRole || user?.role || "victim";
    const selectedRole = activeRole || currentRole;
    const isAssignedToIncident = Boolean(user?.assignedIncident);

    useEffect(() => {
        const initialSkills = Array.isArray(user?.skills) ? user.skills : [];
        setSkills(initialSkills);
    }, [user?.skills]);

    const addSkill = () => {
        const next = String(skillInput || "").trim();
        if (!next) return;
        setSkills((prev) => [...new Set([...prev, next])]);
        setSkillInput("");
    };

    const removeSkill = (skillToRemove) => {
        setSkills((prev) => prev.filter((skill) => skill !== skillToRemove));
    };

    const saveSkills = async () => {
        setError("");
        setMessage("");
        setLoading(true);

        try {
            const res = await fetch("/api/update", {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ skills }),
            });

            const payload = await res.json();
            if (!res.ok || payload?.status !== "success") {
                throw new Error(payload?.msg || "Failed to update skills");
            }

            const updatedSkills = payload?.data?.user?.skills || skills;

            await update({
                activeRole: payload?.data?.user?.activeRole || currentRole,
                role: payload?.data?.user?.activeRole || currentRole,
                roles: payload?.data?.user?.roles || user?.roles || allRoles,
                assignedIncident: payload?.data?.user?.assignedIncident ?? user?.assignedIncident ?? null,
                skills: updatedSkills,
            });

            setSkills(updatedSkills);
            setMessage("Skills updated successfully");
        } catch (err) {
            setError(err?.message || "Failed to update skills");
        } finally {
            setLoading(false);
        }
    };

    const onSaveRole = async (event) => {
        event.preventDefault();
        setError("");
        setMessage("");

        if (!selectedRole) {
            setError("Please choose a role");
            return;
        }

        if (selectedRole === currentRole) {
            setMessage("No changes to save");
            return;
        }

        setLoading(true);
        try {
            const res = await fetch("/api/update", {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ activeRole: selectedRole }),
            });

            const payload = await res.json();
            if (!res.ok || payload?.status !== "success") {
                throw new Error(payload?.msg || "Failed to update profile");
            }

            await update({
                activeRole: payload?.data?.user?.activeRole || selectedRole,
                role: payload?.data?.user?.activeRole || selectedRole,
                roles: payload?.data?.user?.roles || user?.roles || allRoles,
                assignedIncident: payload?.data?.user?.assignedIncident ?? null,
            });

            setMessage("Profile updated successfully");
        } catch (err) {
            setError(err?.message || "Failed to update profile");
        } finally {
            setLoading(false);
        }
    };

    if (status === "loading") {
        return (
            <div className="container mx-auto px-4 py-8">
                <span className="loading loading-spinner loading-md"></span>
            </div>
        );
    }

    if (!user) {
        return (
            <div className="container mx-auto px-4 py-8">
                <div className="alert alert-warning">
                    <span>Please login to view your profile.</span>
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-8">
            <section className="card bg-base-100 shadow-xl border border-base-300 max-w-2xl mx-auto">
                <div className="card-body space-y-4">
                    <h1 className="card-title text-3xl">Profile</h1>

                    {error && (
                        <div className="alert alert-error">
                            <span>{error}</span>
                        </div>
                    )}

                    {message && (
                        <div className="alert alert-success">
                            <span>{message}</span>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <label className="form-control">
                            <span className="label-text">Name</span>
                            <input className="input input-bordered" value={user?.name || ""} readOnly />
                        </label>

                        <label className="form-control">
                            <span className="label-text">Email</span>
                            <input className="input input-bordered" value={user?.email || ""} readOnly />
                        </label>
                    </div>

                    <div>
                        <div className="text-sm font-medium mb-2">Available Roles</div>
                        <div className="flex flex-wrap gap-2">
                            {allRoles.map((role) => (
                                <span key={role} className={`badge ${role === currentRole ? "badge-primary" : "badge-outline"}`}>
                                    {role}
                                </span>
                            ))}
                        </div>
                    </div>

                    {isAssignedToIncident && (
                        <div className="alert alert-warning">
                            <span>You are assigned to an incident, so role switching is temporarily disabled.</span>
                        </div>
                    )}

                    <form className="space-y-3" onSubmit={onSaveRole}>
                        <label className="form-control">
                            <span className="label-text">Active Role</span>
                            <select
                                className="select select-bordered"
                                value={selectedRole}
                                onChange={(e) => setActiveRole(e.target.value)}
                                disabled={isAssignedToIncident || loading}
                            >
                                {allRoles.map((role) => (
                                    <option key={role} value={role}>
                                        {role}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={loading || isAssignedToIncident}
                        >
                            {loading ? "Saving..." : "Save Changes"}
                        </button>
                    </form>

                    <div className="space-y-3">
                        <div className="text-sm font-medium">Skills</div>
                        <div className="join w-full">
                            <input
                                type="text"
                                className="input input-bordered join-item w-full"
                                placeholder="Add a skill"
                                value={skillInput}
                                onChange={(e) => setSkillInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        addSkill();
                                    }
                                }}
                            />
                            <button
                                type="button"
                                className="btn btn-outline join-item"
                                onClick={addSkill}
                                disabled={loading}
                            >
                                Add
                            </button>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            {skills.length === 0 ? (
                                <span className="text-sm text-base-content/70">No skills added yet.</span>
                            ) : (
                                skills.map((skill) => (
                                    <span key={skill} className="badge badge-outline gap-2 py-3 px-3">
                                        {skill}
                                        <button
                                            type="button"
                                            className="btn btn-ghost btn-xs"
                                            onClick={() => removeSkill(skill)}
                                            disabled={loading}
                                            aria-label={`Remove ${skill}`}
                                        >
                                            x
                                        </button>
                                    </span>
                                ))
                            )}
                        </div>

                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={saveSkills}
                            disabled={loading}
                        >
                            {loading ? "Saving..." : "Save Skills"}
                        </button>
                    </div>
                </div>
            </section>
        </div>
    );
}
