"use server"
import { redirect } from "next/navigation";
import { auth } from "./api/auth/[...nextauth]/route";


/**
 * Dashboard/Home Page
 * Shows role-based options, explanations, and navigation.
 */
export default async function Home() {
    redirect('/dashboard')
}
