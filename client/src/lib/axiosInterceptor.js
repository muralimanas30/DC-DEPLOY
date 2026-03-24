import axios from "axios";
import { resolveBackendBaseUrl } from "@/lib/backendBaseUrl";

const instance = axios.create({
    baseURL: resolveBackendBaseUrl(),
    headers: {
        "Content-Type": "application/json",
    },
});

instance.interceptors.request.use((config) => {
    config.headers["X-Service"] = "nextjs";
    return config;
});

instance.interceptors.response.use(
    (response) => response,
    async (error) => {
        if (error.response?.status === 401) {
            console.error("Backend token invalid or expired");
        }
        return Promise.reject(error);
    }
);

export default instance;