"use client";
import axios from "axios";
import { signIn } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import SubmitButton from "./SubmitButton";
import AuthButtons from "./button/AuthButtons";

export default function AuthForm({ mode = "login" }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [form, setForm] = useState({
        name: "",
        email: "",
        password: "",
    });

    useEffect(() => {
        const authError = searchParams.get("authError");
        const nextAuthError = searchParams.get("error");

        if (authError) {
            setError(authError);
            return;
        }

        if (nextAuthError === "AccessDenied") {
            setError("Unable to complete sign-in. Please verify backend service is running.");
        }
    }, [searchParams]);

    const handleChange = (e) =>
        setForm({ ...form, [e.target.name]: e.target.value });

    const normalizeAuthError = (rawError) => {
        if (!rawError) return "Login failed";

        const value = String(rawError);
        if (value === "CredentialsSignin" || value === "Configuration") {
            return "Invalid email or password";
        }

        if (value === "AccessDenied") {
            return "Unable to complete sign-in. Please verify backend service is running.";
        }

        return value;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            if (mode === "register") {
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

                if (response.data.status != "success") {
                    setError(response.data?.msg || "Request failed");
                    return;
                }

                const signInRes = await signIn("credentials", {
                    email: form.email,
                    password: form.password,
                    redirect: false,
                });

                if (signInRes?.error) {
                    setError(normalizeAuthError(signInRes.error));
                    return;
                }
            } else {
                const signInRes = await signIn("credentials", {
                    email: form.email,
                    password: form.password,
                    redirect: false,
                });

                if (signInRes?.error) {
                    setError(normalizeAuthError(signInRes.error));
                    return;
                }
            }

            router.push("/");
        } catch (err) {
            setError(err?.response?.data?.msg || "Request failed");
        } finally {
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
