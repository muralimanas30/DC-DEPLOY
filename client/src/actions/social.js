"use server"
import axios from "axios"
import { signIn, signOut } from "@/app/api/auth/[...nextauth]/route"
import { cookies } from "next/headers";
import instance from "@/lib/axiosInterceptor";
import { getSession } from "next-auth/react";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

const cookieStore = cookies();
const session = getSession(authOptions);

export async function doSocialLogin(provider) {
    await signIn(provider, { redirectTo: "/dashboard" })
}

export async function doLogout() {

    await signOut({ redirectTo: "/dashboard" })
}
export async function doCredentialLogin(formdata) {
    const response = await signIn("credentials", {
        redirect: false,
        email: formdata.email,
        password: formdata.password,
    });

    return response;
}



export async function getUser(credentials) {
    const response = await axios.post(
        `${process.env.BACKEND_URL}/api/auth/login`,
        {
            email: credentials.email,
            password: credentials.password,
        },
        {
            validateStatus: () => true,
        }
    );

    return response.data; // { status, msg, user, token }
}

