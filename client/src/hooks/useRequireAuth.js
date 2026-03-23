import { useEffect } from "react";
import { useRouter } from "next/navigation";
import useAuth from "./useAuth";

export default function useRequireAuth() {
    const { user, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading && !user) {
            router.replace("/dashboard");
        }
    }, [user, loading, router]);

    return { user, loading };
}
