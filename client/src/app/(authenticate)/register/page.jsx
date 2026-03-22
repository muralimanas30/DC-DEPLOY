"use client";
import AuthForm from "../../../components/SignIn";
import Hero from "../../../components/Hero";

export default function RegisterPage() {
  return (
    <div className="flex flex-col md:flex-row items-center justify-center min-h-screen gap-8">
      <div className="w-full max-w-md bg-gradient-to-br from-primary/20 via-base-100 to-accent/10 rounded-2xl p-10 shadow-2xl border-2 border-primary/30">
        <h1 className="text-2xl font-bold mb-4">Register</h1>
        <p className="mb-6 text-base">
          Create your Disaster Connect account and become part of a community that
          cares. Register as a victim, volunteer, or admin to report incidents,
          offer help, and stay connected during emergencies. Your journey to
          safety, support, and impact starts here.
        </p>
        <AuthForm mode="register" />
      </div>
      {/* Animated vertical divider, only on md+ screens */}
      <div className="hidden md:flex h-[320px]">
        <div className="w-2 flex items-center justify-center">
          <span className="block h-full w-1 rounded-full bg-gradient-to-b from-primary via-accent to-secondary animate-pulse"></span>
        </div>
      </div>
      <Hero
        line1="Create your Disaster Connect account"
        line2="Register as a victim, volunteer, or admin and start making a difference."
        line3="Fast onboarding. Secure data. Community impact."
        mode="register"
      />
    </div>
  );
}
