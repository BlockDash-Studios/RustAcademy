import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { NetworkBadge } from "@/components/NetworkBadge";
import { WorkspaceProvider } from "@/context/WorkspaceContext";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "QuickEx",
  description: "Privacy-focused payments on Stellar",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-neutral-950 text-white`}
      >
        <WorkspaceProvider>
          <header className="border-b border-white/5 bg-neutral-950/60 backdrop-blur-xl sticky top-0 z-50">
            <nav className="container mx-auto px-6 py-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <Link href="/" className="flex items-center gap-2 shrink-0 lg:mr-4">
                  <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center font-bold italic">
                    Q
                  </div>
                  <span className="text-xl font-bold tracking-tight">QuickEx</span>
                </Link>

                <div className="hidden md:flex gap-8 text-sm text-neutral-400 font-medium">
                  <Link href="/dashboard" className="hover:text-white transition">
                    Dashboard
                  </Link>
                  <Link href="/generator" className="hover:text-white transition">
                    Generator
                  </Link>
                  <Link href="/settings" className="hover:text-white transition">
                    Settings
                  </Link>
                </div>
              </div>

              <div className="flex items-center gap-4 justify-end">
                <WorkspaceSwitcher />
              </div>
            </nav>
          </header>

          <main className="min-h-screen container mx-auto px-6 py-10">
            {children}
          </main>
        </WorkspaceProvider>

        <footer className="container mx-auto px-6 py-12 border-t border-white/5 text-neutral-500 text-sm">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <p>© 2026 QuickEx Platform. Built by Pulsefy.</p>
            <div className="flex gap-8 underline underline-offset-4 decoration-white/10 hover:decoration-white/20">
              <a href="https://github.com/pulsefy/QuickEx" target="_blank">
                GitHub
              </a>
              <a href="#">Terms</a>
              <a href="#">Privacy</a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
