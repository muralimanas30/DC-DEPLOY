"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import useCurrentLocation from "@/hooks/useCurrentLocation";
import useOfflineMode from "@/hooks/useOfflineMode";

const TARGET_SMS_NUMBER = process.env.NEXT_PUBLIC_OFFLINE_SMS_NUMBER || "";
const OFFLINE_REPORT_STORAGE_KEY = "dc.offline-report.form.v2";

const readStoredForm = () => {
    if (typeof window === "undefined") return {};

    try {
        const raw = window.localStorage.getItem(OFFLINE_REPORT_STORAGE_KEY);
        if (!raw) return {};

        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
};

const formatCoord = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return parsed.toFixed(6);
};

const buildSmsUri = (recipient, body) => {
    const encodedBody = encodeURIComponent(body || "");
    const normalizedRecipient = String(recipient || "").trim();
    if (normalizedRecipient) {
        return `sms:${normalizedRecipient}?body=${encodedBody}`;
    }

    return `sms:?body=${encodedBody}`;
};

export default function OfflineReportPage() {
    const { data: session } = useSession();
    const { isOfflineMode, setOfflineMode } = useOfflineMode();
    const { location, error: locationError } = useCurrentLocation();

    const [reportType, setReportType] = useState("incident");
    const [incidentRef, setIncidentRef] = useState("");
    const [recipient, setRecipient] = useState(String(TARGET_SMS_NUMBER || ""));
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [details, setDetails] = useState("");
    const [lastDraft, setLastDraft] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [copied, setCopied] = useState(false);
    const [localError, setLocalError] = useState("");

    useEffect(() => {
        if (!phone && session?.user?.phone) {
            setPhone(String(session.user.phone));
        }
    }, [phone, session?.user?.phone]);

    useEffect(() => {
        if (!email && session?.user?.email) {
            setEmail(String(session.user.email));
        }
    }, [email, session?.user?.email]);

    useEffect(() => {
        const stored = readStoredForm();

        if (!phone && stored.phone) {
            setPhone(String(stored.phone));
        }

        if (!incidentRef && stored.incidentRef) {
            setIncidentRef(String(stored.incidentRef));
        }

        if (!details && stored.details) {
            setDetails(String(stored.details));
        }

        if (!recipient && stored.recipient) {
            setRecipient(String(stored.recipient));
        }

        if (!email && stored.email) {
            setEmail(String(stored.email));
        }
        // intentionally run once for hydration from local storage
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") return;

        const payload = {
            recipient,
            email,
            phone,
            reportType,
            incidentRef,
            details,
            updatedAt: Date.now(),
        };

        window.localStorage.setItem(OFFLINE_REPORT_STORAGE_KEY, JSON.stringify(payload));
    }, [recipient, email, phone, reportType, incidentRef, details]);

    const normalizedLocation = useMemo(() => {
        if (
            location?.type === "Point"
            && Array.isArray(location.coordinates)
            && location.coordinates.length === 2
        ) {
            return {
                lng: Number(location.coordinates[0]),
                lat: Number(location.coordinates[1]),
            };
        }

        if (Number.isFinite(Number(location?.lng)) && Number.isFinite(Number(location?.lat))) {
            return {
                lng: Number(location.lng),
                lat: Number(location.lat),
            };
        }

        if (Number.isFinite(Number(location?.longitude)) && Number.isFinite(Number(location?.latitude))) {
            return {
                lng: Number(location.longitude),
                lat: Number(location.latitude),
            };
        }

        return null;
    }, [location]);

    const smsDraft = useMemo(() => {
        const typeLabel = reportType === "alert" ? "ALERT" : "INCIDENT";
        const sender = (session?.user?.name || "Guest User").trim();
        const contact = phone?.trim() || "unknown";
        const emailValue = email?.trim() || "unknown";
        const lat = formatCoord(normalizedLocation?.lat) || "n/a";
        const lng = formatCoord(normalizedLocation?.lng) || "n/a";
        const shortRef = incidentRef.trim() ? `REF:${incidentRef.trim()} | ` : "";
        const body = details.trim() || "No additional details provided";

        return `DC_REPORT | TYPE:${typeLabel} | ${shortRef}FROM:${sender} | EMAIL:${emailValue} | PHONE:${contact} | LOC:${lat},${lng} | DETAILS:${body}`;
    }, [reportType, session?.user?.name, email, phone, normalizedLocation?.lat, normalizedLocation?.lng, incidentRef, details]);

    const canCompose = Boolean(recipient.trim() && email.trim() && phone.trim() && details.trim());

    const handleCopyDraft = async () => {
        try {
            await navigator.clipboard.writeText(smsDraft);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        } catch {
            setLocalError("Unable to copy automatically. Please copy manually.");
        }
    };

    const handleOpenSms = async (event) => {
        event.preventDefault();
        setLocalError("");

        if (!canCompose || isSubmitting) {
            setLocalError("Recipient, email, phone number, and report details are required.");
            return;
        }

        setIsSubmitting(true);
        setLastDraft(smsDraft);

        try {
            if (session?.user?.token) {
                await fetch("/api/sms/report", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        type: reportType,
                        incidentId: incidentRef.trim() || null,
                        phone: phone.trim(),
                        message: smsDraft,
                        lat: normalizedLocation?.lat,
                        lng: normalizedLocation?.lng,
                        location: normalizedLocation
                            ? { lat: normalizedLocation.lat, lng: normalizedLocation.lng }
                            : null,
                    }),
                });
            }
        } catch {
            // Ignore logging failures in offline mode. Opening SMS is primary path.
        } finally {
            setIsSubmitting(false);
        }

        if (typeof window !== "undefined") {
            window.location.href = buildSmsUri(recipient, smsDraft);
        }
    };

    return (
        <div className="container mx-auto px-4 py-8 space-y-6">
            <section className="rounded-2xl border border-base-300 bg-base-100 p-6 shadow-xl">
                <h1 className="text-2xl font-bold">Offline SMS Report</h1>
                <p className="mt-2 text-sm text-base-content/70">
                    Use this page to quickly compose a report and open your phone SMS app with prefilled details.
                </p>

                {!isOfflineMode ? (
                    <div className="alert alert-warning mt-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between w-full">
                            <span>Offline mode is currently off. Enable it for limited workflow mode.</span>
                            <button
                                type="button"
                                className="btn btn-warning btn-xs sm:btn-sm"
                                onClick={() => setOfflineMode(true)}
                            >
                                Enable Offline Mode
                            </button>
                        </div>
                    </div>
                ) : null}

                {session?.user?.activeRole === "victim" ? null : (
                    <div className="alert alert-info mt-4">
                        This workflow is optimized for victim reporting. You can still use it for testing.
                    </div>
                )}
            </section>

            <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <form className="card bg-base-100 border border-base-300 shadow-lg" onSubmit={handleOpenSms}>
                    <div className="card-body">
                        <h2 className="card-title">Compose Message</h2>

                        {localError ? <div className="alert alert-error text-sm">{localError}</div> : null}
                        {locationError ? <div className="alert alert-warning text-sm">Location: {locationError}</div> : null}

                        <label className="form-control">
                            <span className="label-text">Report Type</span>
                            <select
                                className="select select-bordered"
                                value={reportType}
                                onChange={(event) => setReportType(event.target.value)}
                            >
                                <option value="incident">Incident</option>
                                <option value="alert">Alert</option>
                            </select>
                        </label>

                        <label className="form-control">
                            <span className="label-text">Gateway Recipient Number</span>
                            <input
                                className="input input-bordered"
                                placeholder="+919876543210"
                                value={recipient}
                                onChange={(event) => setRecipient(event.target.value)}
                                required
                            />
                        </label>

                        <label className="form-control">
                            <span className="label-text">Your Email</span>
                            <input
                                className="input input-bordered"
                                placeholder="you@example.com"
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                required
                            />
                        </label>

                        <label className="form-control">
                            <span className="label-text">Incident/Alert Ref (optional)</span>
                            <input
                                className="input input-bordered"
                                placeholder="e.g. 67df2d..."
                                value={incidentRef}
                                onChange={(event) => setIncidentRef(event.target.value)}
                            />
                        </label>

                        <label className="form-control">
                            <span className="label-text">Your Phone Number</span>
                            <input
                                className="input input-bordered"
                                placeholder="+15551234567"
                                value={phone}
                                onChange={(event) => setPhone(event.target.value)}
                                required
                            />
                        </label>

                        <label className="form-control">
                            <span className="label-text">Details</span>
                            <textarea
                                className="textarea textarea-bordered min-h-30"
                                placeholder="What happened? injuries, fire, blocked roads, urgency..."
                                value={details}
                                onChange={(event) => setDetails(event.target.value)}
                                required
                            />
                        </label>

                        <div className="text-xs text-base-content/70">
                            Location: {formatCoord(normalizedLocation?.lat) || "n/a"}, {formatCoord(normalizedLocation?.lng) || "n/a"}
                        </div>

                        <div className="card-actions justify-end mt-2">
                            <button type="button" className="btn btn-outline btn-sm" onClick={handleCopyDraft}>
                                {copied ? "Copied" : "Copy SMS"}
                            </button>
                            <button type="submit" className="btn btn-warning btn-sm" disabled={!canCompose || isSubmitting}>
                                {isSubmitting ? "Preparing..." : "Open SMS App"}
                            </button>
                        </div>
                    </div>
                </form>

                <article className="card bg-base-100 border border-base-300 shadow-lg">
                    <div className="card-body">
                        <h2 className="card-title">SMS Preview</h2>
                        <p className="text-sm text-base-content/70">
                            This is the exact text that will be opened in your SMS app.
                        </p>

                        <div className="rounded-lg border border-base-300 bg-base-200 p-4 text-sm wrap-break-word">
                            {smsDraft}
                        </div>

                        {lastDraft ? (
                            <div className="rounded-lg border border-success/30 bg-success/10 p-3 text-sm">
                                Last prepared draft: {lastDraft}
                            </div>
                        ) : null}

                        <div className="mt-3 text-xs text-base-content/60">
                            Default gateway number: {TARGET_SMS_NUMBER || "Not set (enter manually above)"}
                        </div>

                        <div className="mt-3">
                            <Link href="/dashboard" className="btn btn-ghost btn-sm px-0">
                                Back to Dashboard
                            </Link>
                        </div>
                    </div>
                </article>
            </section>
        </div>
    );
}
