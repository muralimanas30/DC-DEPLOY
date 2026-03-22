import { useSelector } from "react-redux";

export default function useAuth() {
    const { user, loading, error, success, token } = useSelector((state) => state.user);
    return { user, loading, error, success, token, isAuthenticated: !!user };
}
