"use client";
import axios from "axios";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import SubmitButton from "./SubmitButton";
import AuthButtons from "./button/AuthButtons";

export default function AuthForm({ mode = "login" }) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [form, setForm] = useState({
        name: "",
        email: "",
        password: "",
    });

    const handleChange = (e) =>
        setForm({ ...form, [e.target.name]: e.target.value });

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            console.log("🟡 Auth flow started");
            setLoading(true);

            if (mode === "register") {
                console.log("🟡 Mode: REGISTER");

                // 1️⃣ Register
                console.log("➡️ Sending register request");
                const response = await axios.post(
                    "/api/register",
                    {
                        name: form.name,
                        email: form.email,
                        password: form.password,
                    },
                    {
                        validateStatus: (status) => status < 500,
                    }
                );

                console.log("⬅️ Register response:", {
                    status: response.status,
                    data: response.data,
                });

                if (response.data.status != "success") {
                    console.warn("❌ Register failed:", response.data?.msg);
                    setError(response.data?.msg || "Register failed");
                    return;
                }

                // 2️⃣ Auto login
                console.log("➡️ Attempting auto-login");

                const signInRes = await signIn("credentials", {
                    email: form.email,
                    password: form.password,
                    redirect: false,
                });

                console.log("⬅️ signIn result:", signInRes);

                if (signInRes?.error) {
                    console.error("❌ Auto-login failed:", signInRes.error);
                    setError(signInRes.error);
                    return;
                }

                console.log("✅ Auto-login success");
            } else {
                console.log("🟡 Mode: LOGIN");

                const signInRes = await signIn("credentials", {
                    email: form.email,
                    password: form.password,
                    redirect: false,
                });

                console.log("⬅️ signIn result:", signInRes);

                if (signInRes?.error) {
                    console.error("❌ Login failed:", signInRes.error);
                    setError(
                        signInRes.error === "Configuration"
                            ? "Invalid email or password"
                            : signInRes.error
                    );
                    return;
                }

                console.log("✅ Login success");
            }

            // 3️⃣ Redirect
            console.log("➡️ Redirecting to /");
            router.push("/");
            console.log("✅ router.push called");
        } catch (err) {
            console.error("🔥 Caught exception:", err);
            console.error("🔥 Axios error data:", err?.response?.data);
            setError(err?.response?.data?.msg || "Something went wrong");
        } finally {
            console.log("🟢 Auth flow finished");
            setLoading(false);
        }


    };
    const invalid =
        !form.email ||
        !form.password ||
        (mode === "register" && !form.name);

    return (
        <form
            onSubmit={handleSubmit}
            className="card bg-base-200 shadow-xl p-6 w-full max-w-md"
        >
            {error && <div className="alert alert-error mb-4">{error}</div>}

            {mode === "register" && (
                <div className="mb-4">
                    <label className="label">Name</label>
                    <input
                        className="input input-bordered w-full"
                        name="name"
                        value={form.name}
                        onChange={handleChange}
                        required
                    />
                </div>
            )}

            <div className="mb-4">
                <label className="label">Email</label>
                <input
                    className="input input-bordered w-full"
                    name="email"
                    value={form.email}
                    onChange={handleChange}
                    autoFocus
                    required
                />
            </div>

            <div className="mb-4">
                <label className="label">Password</label>
                <input
                    className="input input-bordered w-full"
                    type="password"
                    name="password"
                    value={form.password}
                    onChange={handleChange}
                    required
                />
            </div>

            <SubmitButton loading={loading} disabled={invalid}>
                {mode === "login" ? "Login" : "Register"}
            </SubmitButton>

            <div className="divider">OR</div>
            <AuthButtons />
        </form>
    );
}
