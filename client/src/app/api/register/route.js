// app/api/register/route.js
import { NextResponse } from "next/server";
import axios from "axios";

export async function POST(request) {
    const body = await request.json();

    try {
        const response = await axios.post(
            `${process.env.BACKEND_URL}/api/auth/register`,
            body,
            { validateStatus: () => true }
        );
        
        return NextResponse.json(response?.data, { status: response?.data?.statusCode });
    } catch (error) {
        return NextResponse.json(
            {
                status: "error",
                msg: error?.response?.data?.msg || "Request failed",
            },
            { status: error?.response?.data?.statusCode || 500 }
        );
    }
}
