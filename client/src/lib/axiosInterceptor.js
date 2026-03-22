import axios from "axios";

const instance = axios.create({
    baseURL: process.env.BACKEND_URL,
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