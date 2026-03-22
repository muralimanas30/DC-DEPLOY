import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useAuth from "./useAuth";

export default function useRequireAuth() {
    const { user, loading } = useAuth();
    const router = useRouter();
    const [checking, setChecking] = useState(true);

    useEffect(() => {
        if (!loading && !user) {
            router.replace("/dashboard");
        } else if (user) {
            setChecking(false);
        }
    }, [user, loading, router]);

    return { user, loading: loading || checking };
}
