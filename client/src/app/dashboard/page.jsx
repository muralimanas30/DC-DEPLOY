import Link from "next/link";
import { auth } from "../api/auth/[...nextauth]/route";
import RoleBriefingSwitcher from "@/components/dashboard/RoleBriefingSwitcher";

const ROLE_CONTENT = {
    victim: {
        title: "Victim Workspace",
        subtitle: "Report incidents quickly and track resolution with full visibility.",
        primaryAction: { href: "/incidents", label: "Report or Track Incident" },
        secondaryAction: { href: "/profile", label: "Update Contact and Skills" },
        highlights: [
            "Submit incidents with accurate severity and details.",
            "Track assignment and closure status in one place.",
            "Keep profile details updated for faster coordination.",
        ],
    },
    volunteer: {
        title: "Volunteer Workspace",
        subtitle: "Join active incidents and deliver response support where needed.",
        primaryAction: { href: "/incidents", label: "View and Join Incidents" },
        secondaryAction: { href: "/profile", label: "Update Availability and Skills" },
        highlights: [
            "Join only one active incident at a time.",
            "Use incident workspace to manage your participation.",
            "Maintain accurate skills for better assignment matching.",
        ],
    },
    admin: {
        title: "Admin Command",
        subtitle: "Coordinate participants, enforce rules, and close incidents safely.",
        primaryAction: { href: "/incidents", label: "Manage Active Incidents" },
        secondaryAction: { href: "/profile", label: "Review Admin Profile" },
        highlights: [
            "Assign and unassign participants with role-aware controls.",
            "Force-close only when operationally necessary.",
            "Monitor active workload and maintain response hygiene.",
        ],
    },
};

const COMMON_MODULES = [
    {
        title: "Incident Workspace",
        description: "Single source of truth for lifecycle, participants, and closure state.",
        href: "/incidents",
        cta: "Open Incidents",
    },
    {
        title: "Identity and Profile",
        description: "Role state, assignment lock, and user skills are managed here.",
        href: "/profile",
        cta: "Open Profile",
    },
    {
        title: "Operational Readiness",
        description: "Use this dashboard as your launch point for role-based response flow.",
        href: "/dashboard",
        cta: "Refresh Dashboard",
    },
];

function getRoleMeta(role) {
    if (!role) return null;
    return ROLE_CONTENT[role] || null;
}

function getDisplayName(name) {
    const full = String(name || "Responder").trim();
    return full.split(/\s+/)[0] || "Responder";
}

/**
 * Dashboard Command Center
 * Role-aware overview with common operational briefing.
 */
export default async function DashboardPage() {
    const session = await auth();
    const user = session?.user;
    const effectiveRole = user?.activeRole || user?.role;
    const roleMeta = getRoleMeta(effectiveRole);
    const firstName = getDisplayName(user?.name);
    const assignedIncident = user?.assignedIncident;

    return (
        <div className="container mx-auto px-4 py-8 space-y-8">
            <section
                className="rounded-2xl border border-base-300 shadow-2xl overflow-hidden"
                style={{
                    background: "linear-gradient(120deg, rgba(15,23,42,0.95) 0%, rgba(2,132,199,0.9) 45%, rgba(16,185,129,0.85) 100%)",
                }}
            >
                <div className="px-6 py-8 md:px-10 md:py-12 text-white">
                    <div className="text-xs tracking-[0.2em] uppercase opacity-80 mb-2">Command Center</div>
                    <h1 className="text-3xl md:text-5xl font-black leading-tight">
                        Disaster Response Dashboard
                    </h1>
                    <p className="mt-4 text-sm md:text-base max-w-3xl opacity-95">
                        Welcome, {firstName}. This dashboard gives a role-aware briefing, shared operational modules,
                        and direct actions to manage incident response flow without navigating multiple pages.
                    </p>
                    <div className="mt-5 flex flex-wrap gap-2">
                        <span className="badge badge-neutral border-0">Role-aware operations</span>
                        <span className="badge badge-neutral border-0">Lifecycle-safe actions</span>
                        <span className="badge badge-neutral border-0">Assignment integrity</span>
                    </div>
                </div>
            </section>

            <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <article className="xl:col-span-2 card bg-base-100 border border-base-300 shadow-xl">
                    <div className="card-body">
                        <h2 className="card-title text-2xl">Operational Briefing</h2>
                        <p className="text-base-content/70">
                            Shared workflow for all roles: identify incident, coordinate participants, complete response,
                            then close with assignment cleanup.
                        </p>

                        <RoleBriefingSwitcher currentRole={effectiveRole} />
                    </div>
                </article>

                <article className="card bg-base-100 border border-base-300 shadow-xl">
                    <div className="card-body">
                        <h2 className="card-title text-xl">Current Session</h2>
                        <div className="space-y-2 text-sm">
                            <p><span className="font-semibold">User:</span> {user?.name || "Guest"}</p>
                            <p><span className="font-semibold">Role:</span> {effectiveRole || "guest"}</p>
                            <p>
                                <span className="font-semibold">Assignment:</span>{" "}
                                {assignedIncident ? "Active incident linked" : "No active assignment"}
                            </p>
                        </div>

                        {assignedIncident && (
                            <Link href="/incidents" className="btn btn-primary btn-sm mt-3">
                                Open Assigned Incident
                            </Link>
                        )}
                    </div>
                </article>
            </section>

            <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {COMMON_MODULES.map((module) => (
                    <article key={module.title} className="card bg-base-100 border border-base-300 shadow-lg">
                        <div className="card-body">
                            <h3 className="card-title text-lg">{module.title}</h3>
                            <p className="text-sm text-base-content/70">{module.description}</p>
                            <Link href={module.href} className="btn btn-outline btn-sm mt-2">
                                {module.cta}
                            </Link>
                        </div>
                    </article>
                ))}
            </section>

            {user && roleMeta ? (
                <section className="card bg-base-100 border border-base-300 shadow-2xl">
                    <div className="card-body">
                        <h2 className="card-title text-2xl">{roleMeta.title}</h2>
                        <p className="text-base-content/70">{roleMeta.subtitle}</p>

                        <div className="flex flex-wrap gap-2 mt-2">
                            <Link href={roleMeta.primaryAction.href} className="btn btn-primary btn-sm">
                                {roleMeta.primaryAction.label}
                            </Link>
                            <Link href={roleMeta.secondaryAction.href} className="btn btn-outline btn-sm">
                                {roleMeta.secondaryAction.label}
                            </Link>
                        </div>

                        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                            {roleMeta.highlights.map((item) => (
                                <div key={item} className="rounded-lg border border-base-300 bg-base-200 p-3 text-sm">
                                    {item}
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            ) : (
                <section className="card bg-base-100 border border-base-300 shadow-xl">
                    <div className="card-body">
                        <h2 className="card-title">Quick Access</h2>
                        <p className="text-base-content/70">
                            Sign in to unlock role-aware actions for incidents, profile updates, and operational workflows.
                        </p>
                        <div className="flex gap-2">
                            <Link href="/login" className="btn btn-primary btn-sm">Login</Link>
                            <Link href="/register" className="btn btn-outline btn-sm">Register</Link>
                        </div>
                    </div>
                </section>
            )}

            <section className="rounded-2xl border border-base-300 bg-base-100 shadow-lg p-6">
                <h2 className="text-xl font-bold">Role Switching Policy</h2>
                <p className="mt-2 text-sm text-base-content/70">
                    The platform allows switching between victim and volunteer modes when operationally needed. To keep response
                    state consistent, role changes are restricted while you are assigned to an active incident.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
                    <div className="rounded-lg border border-base-300 bg-base-200 p-4 text-sm">
                        <div className="font-semibold">Victim to Volunteer</div>
                        <p className="text-base-content/70 mt-1">Allowed when there is no active assignment and profile is updated.</p>
                    </div>
                    <div className="rounded-lg border border-base-300 bg-base-200 p-4 text-sm">
                        <div className="font-semibold">Volunteer to Victim</div>
                        <p className="text-base-content/70 mt-1">Allowed when current participation is resolved or incident is closed.</p>
                    </div>
                    <div className="rounded-lg border border-base-300 bg-base-200 p-4 text-sm">
                        <div className="font-semibold">Admin Safety Rule</div>
                        <p className="text-base-content/70 mt-1">Admin actions remain governed by assignment and closure integrity checks.</p>
                    </div>
                </div>
            </section>
        </div>
    );
}
