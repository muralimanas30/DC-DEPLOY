"use client";
export default function SubmitButton({ loading, children }) {
    return (
        <button className="btn btn-primary w-full" type="submit" disabled={loading}>
            {loading ? <span className="loading loading-spinner"></span> : children}
        </button>
    );
}
