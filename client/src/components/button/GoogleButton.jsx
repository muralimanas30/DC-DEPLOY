"use client"
import { FcGoogle } from "react-icons/fc";
import { signIn } from "@/app/api/auth/[...nextauth]/route";
import { doSocialLogin } from "@/actions/social";

export default function GoogleButton() {
    const handleClick = async () => {
        await doSocialLogin("github");
    }

    return (
        <button onClick={handleClick} type="button" className="flex w-fit items-center gap-3 rounded-md border px-4 py-2 font-medium hover:bg-gray-50">
            Sign in with <FcGoogle size={20} />
        </button>

    );
}