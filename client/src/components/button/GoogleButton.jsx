"use client"
import { FcGoogle } from "react-icons/fc";
import { signIn } from "next-auth/react";

export default function GoogleButton() {
    const handleClick = async () => {
        await signIn("google", { callbackUrl: "/dashboard" });
    }

    return (
        <button onClick={handleClick} type="button" className="flex w-fit items-center gap-3 rounded-md border px-4 py-2 font-medium hover:bg-gray-50">
            Sign in with <FcGoogle size={20} />
        </button>

    );
}