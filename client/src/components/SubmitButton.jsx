// Reusable submit button with loading and disabled state
// Props: loading (bool), disabled (bool), children (node), className (string), ...rest
"use client";
import React from "react";

export default function SubmitButton({ loading, disabled, children, className = "", ...rest }) {
    return (
        <button
            type="submit"
            className={`btn btn-primary ${className}`}
            disabled={loading || disabled}
            aria-disabled={loading || disabled}
            {...rest}
        >
            {loading ? (
                <span className="loading loading-spinner loading-sm"></span>
            ) : (
                children
            )}
        </button>
    );
}
