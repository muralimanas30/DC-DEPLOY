"use client"
import GoogleButton from "./GoogleButton";
import GithubButton from "./GithubButton";

export default function AuthButtons() {
    return (
        <div className="flex  gap-3 flex-wrap" >
            <GoogleButton />
            <GithubButton />
        </div>
    );
}