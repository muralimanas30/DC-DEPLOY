"use client";
import { useEffect } from "react";
import { syncUserFromSessionStorage } from "../store";

export default function AppClientProvider({ children }) {
    useEffect(() => {
        syncUserFromSessionStorage();
    }, []);
    return children;
}
