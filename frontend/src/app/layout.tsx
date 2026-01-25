import type { Metadata } from "next";
import { Inter } from "next/font/google"; // Using Inter for modern look
import "./globals.css";
import AuroraBackground from "@/components/AuroraBackground";
import ToastContainer from "@/components/ToastContainer";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AI Voice Assistant",
  description: "Next-gen voice assistant with VAD and noise suppression",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuroraBackground />
        <main className="relative min-h-screen text-white overflow-hidden">
          {children}
        </main>
        <ToastContainer />
      </body>
    </html>
  );
}
