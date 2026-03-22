"use server"
import { signIn, signOut } from "@/app/api/auth/[...nextauth]/route"

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

