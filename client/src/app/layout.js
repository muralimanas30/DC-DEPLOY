import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import "react-leaflet-markercluster/styles";

import Provider from "./Provider";
import Navbar from "@/components/NavBar";
import AuthGuard from "@/components/AuthGuard";
import PwaRegister from "@/components/PwaRegister";
import { auth } from "./api/auth/[...nextauth]/route";
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Disaster Connect",
  description: "Disaster response coordination",
  manifest: "/manifest.webmanifest",
};

export default async function RootLayout({ children }) {
  // const session = await auth();
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/7.0.1/css/all.min.css" integrity="sha512-2SwdPD6INVrV/lHTZbO2nodKhrnDdJK9/kg2XD1r9uGqPo1cUbujc+IYdlYdEErWNu69gVcYgdxlmVmzTWnetw==" crossOrigin="anonymous" referrerPolicy="no-referrer" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#12364a" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Disaster Connect" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Provider>
          <PwaRegister />
          <AuthGuard>
            <Navbar  />
            {children}
          </AuthGuard>
        </Provider>
      </body>
    </html>
  );
}
