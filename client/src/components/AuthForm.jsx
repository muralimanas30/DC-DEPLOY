"use client";
import { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useRouter } from "next/navigation";
import SubmitButton from "./SubmitButton";

export default function AuthForm({ mode }) {
    const [form, setForm] = useState({
        name: "",
        email: "",
        password: "",
        role: "victim",
        phone: "",
        currentLocation: { type: "Point", coordinates: [0, 0] },
    });
    const router = useRouter();
    const { loading, error, success } = useSelector((state) => state.user);
    useEffect(() => {
        if (mode === "register" && success) {
            router.push("/login");
        }
    }, [success, mode, router]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm((prev) => ({
            ...prev,
            [name]: name === "role" ? value : value,
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (mode === "register") {
            const data = {
                ...form,
                currentLocation: geoLocation
                    ? {
                        type: "Point",
                        coordinates: [
                            Number(geoLocation.coordinates[0]),
                            Number(geoLocation.coordinates[1])
                        ]
                    }
                    : {
                        type: "Point",
                        coordinates: [
                            Number(form.currentLocation.coordinates[0]),
                            Number(form.currentLocation.coordinates[1])
                        ]
                    }
            };
            // dispatch(registerUserThunk(data));
        } else {
            const loginData = {
                email: form.email,
                password: form.password,
            };
            // Attach location to login thunk if needed by backend
            if (geoLocation) {
                loginData.currentLocation = {
                    type: "Point",
                    coordinates: [
                        Number(geoLocation.coordinates[0]),
                        Number(geoLocation.coordinates[1])
                    ]
                };
            }
            // dispatch(loginUserThunk(loginData));
        }
    };

    const formInvalid = !form.email || !form.password || (mode === "register" && (!form.name || !form.role));

    return (
        <form
            onSubmit={handleSubmit}
            className="card bg-base-200 shadow-xl p-6 w-full max-w-md"
        >
            {/* Show error message if present */}
            {error && (
                <div className="alert alert-error mb-4" role="alert">
                    {typeof error === "string"
                        ? error
                        : error?.msg
                            ? error.msg
                            : error?.message
                                ? error.message
                                : JSON.stringify(error)}
                </div>
            )}
            {/* Show success message if present */}
            {success && (
                <div className="alert alert-success mb-4" role="alert">
                    {success}
                </div>
            )}
            {mode === "register" && (
                <>
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
                    <div className="mb-4">
                        <label className="label">Role</label>
                        <select
                            className="select select-bordered w-full"
                            name="role"
                            value={form.role}
                            onChange={handleChange}
                            required
                        >
                            <option value="victim">Victim</option>
                            <option value="volunteer">Volunteer</option>
                            <option value="admin">Admin</option>
                        </select>
                    </div>
                    <div className="mb-4">
                        <label className="label">Phone</label>
                        <input
                            className="input input-bordered w-full"
                            name="phone"
                            value={form.phone}
                            onChange={handleChange}
                        />
                    </div>
                    {/* Add location input as needed */}
                </>
            )}
            <div className="mb-4">
                <label className="label">Email</label>
                <input
                    className="input input-bordered w-full"
                    name="email"
                    value={form.email}
                    onChange={handleChange}
                    required
                    autoFocus
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
            <SubmitButton loading={loading} disabled={formInvalid}>
                {mode === "login" ? "Login" : "Register"}
            </SubmitButton>
        </form>
    );
}
