"use client"
import { FaGithub } from "react-icons/fa";
import { signIn } from "next-auth/react";

export default function GithubButton() {
    const handleClick = async () => {
        await signIn("github", { callbackUrl: "/dashboard" });
    };

    return (
        <button
            onClick={handleClick} type="button"
            className="flex w-fit flex-wrap items-center gap-3 rounded-md border px-4 py-2 font-medium hover:bg-gray-50"
        >
            Sign in with <FaGithub size={20} />
        </button>
    );
}