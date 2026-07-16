"use client";

import { useEffect, useState } from "react";
import { errorReporter } from "@/lib/errorReporter";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "pwa-install-dismissed-at";
const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // re-offer after 7 days

function wasRecentlyDismissed(): boolean {
  try {
    const dismissedAt = Number(localStorage.getItem(DISMISSED_KEY));
    return !!dismissedAt && Date.now() - dismissedAt < DISMISS_COOLDOWN_MS;
  } catch {
    return false;
  }
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari
    (navigator as { standalone?: boolean }).standalone === true
  );
}

export function PWAHandler() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // Register Service Worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          // SW registered

          reg.addEventListener("updatefound", () => {
            const newWorker = reg.installing;
            newWorker?.addEventListener("statechange", () => {
              if (
                newWorker.state === "installed" &&
                navigator.serviceWorker.controller
              ) {
                // New content is available; please refresh.
                if (
                  confirm(
                    "A new version of RustAcademy is available. Refresh now?",
                  )
                ) {
                  window.location.reload();
                }
              }
            });
          });
        })
        .catch((err) => errorReporter.captureError(err, { context: { component: 'PWAHandler' } }));
    }

    // Check if already installed
    if (isStandalone()) {
      setIsInstalled(true);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
      if (!wasRecentlyDismissed()) {
        setShowBanner(true);
      }
    };

    window.addEventListener("beforeinstallprompt", handler);

    window.addEventListener("appinstalled", () => {
      setIsInstalled(true);
      setShowBanner(false);
      setInstallPrompt(null);
    });

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") {
      setShowBanner(false);
    }
  };

  const handleDismiss = () => {
    setShowBanner(false);
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      // localStorage unavailable (private mode) — banner just reappears next visit
    }
  };

  if (!showBanner || isInstalled) return null;

  return (
    <div className="fixed bottom-6 left-6 right-6 md:left-auto md:right-8 md:w-96 z-50 animate-in fade-in slide-in-from-bottom-5 duration-500">
      <div className="bg-neutral-900 border border-white/10 rounded-2xl p-5 shadow-2xl backdrop-blur-xl">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center flex-shrink-0 shadow-lg shadow-purple-500/20">
            <svg
              viewBox="0 0 24 24"
              className="w-6 h-6 text-white fill-current"
            >
              <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-white">
              Install RustAcademy App
            </h3>
            <p className="text-sm text-neutral-400 mt-1">
              Add RustAcademy to your home screen for a faster, offline-ready
              experience.
            </p>
            <div className="flex gap-3 mt-4">
              <button
                onClick={handleInstall}
                className="flex-1 bg-white text-black text-sm font-bold py-2.5 rounded-lg hover:bg-neutral-200 transition-colors"
              >
                Install Now
              </button>
              <button
                onClick={handleDismiss}
                className="px-4 py-2.5 text-sm font-medium text-neutral-400 hover:text-white transition-colors"
              >
                Later
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
