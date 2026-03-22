import Link from "next/link";
import { auth } from "../api/auth/[...nextauth]/route";


/**
 * Dashboard Page
 * Shows role-based options, explanations, and navigation.
 * Enhanced with cards, gradients, accordions, and visual effects.
 */
export default async function  DashboardPage() {

    const session = await auth();
    const user  = session?.user;
    const effectiveRole = user?.activeRole || user?.role;
    // const { assignedIncident } = useSelector((state) => state.incidents);

    return (
        <div className="container mx-auto py-10">
            {/* Hero Section with Gradient */}
            <div className="hero rounded-xl shadow-2xl mb-8 transition-all duration-500 ease-in-out"
                style={{
                    background: "linear-gradient(90deg, #6366f1 0%, #06b6d4 100%)",
                    color: "white",
                }}
            >
                <div className="hero-content flex-col text-center py-10">
                    <h1 className="text-5xl font-extrabold mb-2 drop-shadow-lg transition-all duration-500">
                        Disaster Response Coordination Platform
                    </h1>
                    <p className="text-lg mb-4 font-medium">
                        Welcome{`, ${user?.name}`}! Your one-stop hub for disaster management, reporting, and coordination.
                    </p>
                    <div className="flex flex-wrap gap-4 justify-center mt-4">
                        <span className="badge badge-primary badge-lg shadow-md transition-all duration-300">Real-time Updates</span>
                        <span className="badge badge-info badge-lg shadow-md transition-all duration-300">Role-based Access</span>
                        <span className="badge badge-success badge-lg shadow-md transition-all duration-300">Secure & Reliable</span>
                    </div>
                </div>
            </div>

            {/* Quick Actions & Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="card bg-gradient-to-br from-base-100 to-base-200 shadow-xl transition-all duration-500 hover:scale-105">
                    <div className="card-body items-center text-center">
                        <h2 className="card-title">Incidents</h2>
                        <p>Report, view, and manage disaster incidents.</p>
                        <Link href="/incidents" className="btn btn-primary btn-wide mt-2 cursor-pointer transition-all duration-300">Go to Incidents</Link>
                    </div>
                </div>
                <div className="card bg-gradient-to-br from-base-100 to-base-200 shadow-xl transition-all duration-500 hover:scale-105">
                    <div className="card-body items-center text-center">
                        <h2 className="card-title">Profile</h2>
                        <p>Update your contact info and preferences.</p>
                        <Link href="/profile" className="btn btn-secondary btn-wide mt-2 cursor-pointer transition-all duration-300">Edit Profile</Link>
                    </div>
                </div>
                <div className="card bg-gradient-to-br from-base-100 to-base-200 shadow-xl transition-all duration-500 hover:scale-105">
                    <div className="card-body items-center text-center">
                        <h2 className="card-title">Dashboard Features</h2>
                        <p>Explore platform features and tips.</p>
                        <a href="#features-accordion" className="btn btn-info btn-wide mt-2 cursor-pointer transition-all duration-300">Learn More</a>
                    </div>
                </div>
            </div>

            {/* Divider */}
            <div className="divider my-8">
                <span className="text-xl font-semibold text-primary">Platform Highlights</span>
            </div>

            {/* Accordion for Features/FAQs */}
            <div id="features-accordion" className="max-w-2xl mx-auto mb-8">
                <div className="collapse collapse-arrow bg-base-200 mb-2 shadow transition-all duration-300">
                    <input type="radio" name="dashboard-accordion" defaultChecked />
                    <div className="collapse-title text-lg font-bold">
                        🚨 Real-time Incident Reporting
                    </div>
                    <div className="collapse-content">
                        <p>
                            Instantly report disasters and emergencies. Volunteers and admins are notified in real-time for rapid response.
                        </p>
                    </div>
                </div>
                <div className="collapse collapse-arrow bg-base-200 mb-2 shadow transition-all duration-300">
                    <input type="radio" name="dashboard-accordion" />
                    <div className="collapse-title text-lg font-bold">
                        🧑‍🤝‍🧑 Role-based Dashboards
                    </div>
                    <div className="collapse-content">
                        <p>
                            Victims, volunteers, and admins each have tailored dashboards and actions for their needs.
                        </p>
                    </div>
                </div>
                <div className="collapse collapse-arrow bg-base-200 mb-2 shadow transition-all duration-300">
                    <input type="radio" name="dashboard-accordion" />
                    <div className="collapse-title text-lg font-bold">
                        🔒 Secure & Reliable
                    </div>
                    <div className="collapse-content">
                        <p>
                            All data is securely handled and only accessible to authorized users. Your privacy and safety are our top priorities.
                        </p>
                    </div>
                </div>
                <div className="collapse collapse-arrow bg-base-200 mb-2 shadow transition-all duration-300">
                    <input type="radio" name="dashboard-accordion" />
                    <div className="collapse-title text-lg font-bold">
                        📊 Analytics & Insights
                    </div>
                    <div className="collapse-content">
                        <p>
                            Admins can view analytics on incident trends, volunteer activity, and response times to improve coordination.
                        </p>
                    </div>
                </div>
            </div>

            {/* Role-based Section */}
            <div className="card bg-base-100 shadow-2xl max-w-2xl mx-auto transition-all duration-500">
                <div className="card-body">
                    {!user && (
                        <>
                            <div className="alert alert-info mb-4">
                                Please <Link href="/login" className="link link-primary">Login</Link> or <Link href="/register" className="link link-secondary">Register</Link> to access the platform.
                            </div>
                        </>
                    )}
                    {user && effectiveRole === "victim" && (
                        <>
                            <h2 className="card-title mb-2">Victim Dashboard</h2>
                            <ul className="menu menu-vertical">
                                <li>
                                    <Link href="/incidents" className="btn btn-primary btn-block mb-2 cursor-pointer">
                                        Report New Incident / View My Incidents
                                    </Link>
                                </li>
                                <li>
                                    <Link href="/profile" className="btn btn-secondary btn-block mb-2 cursor-pointer">
                                        Edit My Profile
                                    </Link>
                                </li>
                            </ul>
                            <div className="alert alert-info mt-4">
                                <span>
                                    As a victim, you can report new incidents, track their status, and update your profile.
                                </span>
                            </div>
                        </>
                    )}
                    {user && effectiveRole === "volunteer" && (
                        <>
                            <h2 className="card-title mb-2">Volunteer Dashboard</h2>
                            <ul className="menu menu-vertical">
                                <li>
                                    <Link href="/incidents" className="btn btn-primary btn-block mb-2 cursor-pointer">
                                        View Available Incidents / My Assignment
                                    </Link>
                                </li>
                                <li>
                                    <Link href="/profile" className="btn btn-secondary btn-block mb-2 cursor-pointer">
                                        Edit My Profile
                                    </Link>
                                </li>
                            </ul>
                            <div className="alert alert-success mt-4">
                                <span>
                                    As a volunteer, you can view available incidents, accept assignments, and update your profile.
                                </span>
                            </div>
                        </>
                    )}
                    {user && effectiveRole === "admin" && (
                        <>
                            <h2 className="card-title mb-2">Admin Dashboard</h2>
                            <ul className="menu menu-vertical">
                                <li>
                                    <Link href="/incidents" className="btn btn-primary btn-block mb-2 cursor-pointer">
                                        Manage All Incidents
                                    </Link>
                                </li>
                                <li>
                                    <Link href="/profile" className="btn btn-secondary btn-block mb-2 cursor-pointer">
                                        Edit My Profile
                                    </Link>
                                </li>
                                {/* Add more admin controls as needed */}
                            </ul>
                            <div className="alert alert-warning mt-4">
                                <span>
                                    As an admin, you can view and manage all incidents and users.
                                </span>
                            </div>
                        </>
                    )}
                    {!user && (
                        <div className="divider">or</div>
                    )}
                    {!user && (
                        <div className="text-center text-base-content/60">
                            <span>
                                This platform helps coordinate disaster response between victims, volunteers, and admins.
                            </span>
                        </div>
                    )}
                </div>
            </div>

        </div>
    );
}
