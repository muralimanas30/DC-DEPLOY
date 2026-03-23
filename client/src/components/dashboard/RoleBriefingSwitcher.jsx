"use client";

import { useMemo, useState } from "react";

const ROLE_STEPS = {
    victim: [
        {
            title: "Report with Clarity",
            description: "Create an incident with precise severity, category, and context so responders can prioritize quickly.",
        },
        {
            title: "Coordinate with Responders",
            description: "Stay in the incident workspace, answer follow-up requests, and keep details accurate during response.",
        },
        {
            title: "Confirm Recovery",
            description: "Mark closure only when help is complete and required support is fully delivered.",
        },
    ],
    volunteer: [
        {
            title: "Pick the Right Incident",
            description: "Join active incidents that match your capacity and skill profile for better response quality.",
        },
        {
            title: "Execute and Update",
            description: "Coordinate in the incident workspace, update progress, and maintain clear communication with victims/admins.",
        },
        {
            title: "Resolve Participation",
            description: "Leave or resolve participation when your task is complete so assignments stay accurate.",
        },
    ],
    admin: [
        {
            title: "Assess and Prioritize",
            description: "Review incoming incidents, evaluate severity, and decide participant allocation based on urgency.",
        },
        {
            title: "Assign and Supervise",
            description: "Assign volunteers/admin participants, monitor progress, and ensure policy-compliant actions.",
        },
        {
            title: "Close with Integrity",
            description: "Use normal closure rules first; force-close only when operations require an administrative override.",
        },
    ],
};

const ROLE_OPTIONS = [
    { key: "victim", label: "Victim" },
    { key: "volunteer", label: "Volunteer" },
    { key: "admin", label: "Admin" },
];

export default function RoleBriefingSwitcher({ currentRole }) {
    const initialRole = useMemo(() => {
        if (currentRole === "victim" || currentRole === "volunteer" || currentRole === "admin") {
            return currentRole;
        }
        return "victim";
    }, [currentRole]);

    const [selectedRole, setSelectedRole] = useState(initialRole);
    const steps = ROLE_STEPS[selectedRole] || ROLE_STEPS.victim;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-4">
                <span className="text-sm font-semibold text-base-content/80">Briefing Focus:</span>
                <div className="flex flex-wrap gap-4">
                    {ROLE_OPTIONS.map((option) => (
                        <label key={option.key} className="label cursor-pointer gap-2 p-0">
                            <input
                                type="radio"
                                name="briefing-role"
                                className="radio radio-sm radio-primary"
                                checked={selectedRole === option.key}
                                onChange={() => setSelectedRole(option.key)}
                            />
                            <span className="label-text text-sm">{option.label}</span>
                        </label>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-1">
                {steps.map((step, index) => (
                    <div key={step.title} className="rounded-xl border border-base-300 bg-base-200 p-4">
                        <div className="text-xs uppercase tracking-wider text-base-content/60">Step {index + 1}</div>
                        <div className="font-bold mt-1">{step.title}</div>
                        <p className="text-sm text-base-content/70 mt-1">{step.description}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}
