import axios from "axios"
import { getSession } from "next-auth/react"

export async function getAxiosServer() {
    const session = await getSession()

    const instance = axios.create({
        baseURL: process.env.BACKEND_URL,
        headers: {
            "Content-Type": "application/json",
            ...(session?.user?.token && {
                Authorization: `Bearer ${session.user.token}`,
            }),
        },
    })

    // REQUEST INTERCEPTOR
    instance.interceptors.request.use((config) => {
        config.headers["X-Service"] = "nextjs"
        return config
    })

    // RESPONSE INTERCEPTOR
    instance.interceptors.response.use(
        (response) => response,
        async (error) => {
            if (error.response?.status === 401) {
                console.error("Backend token invalid or expired")
            }
            return Promise.reject(error)
        }
    )

    return instance
}
const instance = await getAxiosServer();
export default instance;