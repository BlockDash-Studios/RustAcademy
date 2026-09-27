"use client";

import { useEffect, useState, useCallback } from "react";
import { errorReporter } from "@/lib/errorReporter";
import { useOnlineStatus } from "@/lib/onlineStatus";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "pwa-install-dismissed-at";
const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // re-offer after 7 days
const INSTALL_PROMPT_DELAY_MS = 3000; // wait 3s after page load before showing
const SW_UPDATE_CHECK_INTERVAL_MS = 60 * 1000; // check for updates every 60s

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

/**
 * Manages PWA installation and updates with safe refresh timing and clear states.
 *
 * Features:
 * - Install prompts appear only in eligible contexts (not already installed, not recently dismissed)
 * - Updates are auto-applied with optional user notification
 * - Dismissal of prompts doesn't break navigation
 * - Clear state management for install flow
 */
export function PWAHandler() {
  const { isOnline } = useOnlineStatus();
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleInstall = useCallback(async () => {
    if (!installPrompt) return;

    try {
      installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;

      if (outcome === "accepted") {
        setShowInstallBanner(false);
        setInstallPrompt(null);
        // Installation confirmed by appinstalled event handler
      } else {
        // User dismissed — don't break UX, just hide the banner
        handleDismissInstall();
      }
    } catch (err) {
      errorReporter.captureError(
        err instanceof Error ? err : new Error(String(err)),
        {
          route: "/",
          extra: {
            component: "PWAHandler.handleInstall",
            context: "Installation prompt failed",
          },
        }
      );
    }
  }, [installPrompt]);

  const handleDismissInstall = useCallback(() => {
    setShowInstallBanner(false);
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      // localStorage unavailable (private mode) — banner reappears next visit
    }
  }, []);

  const handleUpdate = useCallback(() => {
    setIsUpdating(true);
    setShowUpdateBanner(false);
    // The refresh triggers the new SW to activate
    window.location.reload();
  }, []);

  const handleDismissUpdate = useCallback(() => {
    setShowUpdateBanner(false);
    // Allow user to dismiss update prompt and continue using current version
  }, []);

  // Register Service Worker and listen for updates
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    let swRegistration: ServiceWorkerRegistration | null = null;
    let updateCheckInterval: NodeJS.Timeout | null = null;

    const registerServiceWorker = async () => {
      try {
        swRegistration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });

        // Check for updates immediately on registration
        swRegistration.update().catch((err) => {
          console.warn("Initial service worker update check failed:", err);
        });

        // Periodic update check
        updateCheckInterval = setInterval(() => {
          swRegistration?.update().catch((err) => {
            console.warn("Service worker update check failed:", err);
          });
        }, SW_UPDATE_CHECK_INTERVAL_MS);

        // Check for updates when app regains focus (visible)
        const handleVisibilityChange = () => {
          if (!document.hidden) {
            swRegistration?.update().catch((err) => {
              console.warn("Service worker focus update check failed:", err);
            });
          }
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);

        // Handle new SW installed and waiting
        swRegistration.addEventListener("updatefound", () => {
          const newWorker = swRegistration!.installing;

          newWorker?.addEventListener("statechange", () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              // New content is available
              setUpdateAvailable(true);

              // Only show update banner if online and not already updating
              if (isOnline && !isUpdating) {
                setShowUpdateBanner(true);
              }
            }
          });
        });

        return () => {
          document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
      } catch (err) {
        errorReporter.captureError(
          err instanceof Error ? err : new Error(String(err)),
          {
            route: "/",
            extra: {
              component: "PWAHandler.registerServiceWorker",
              context: "Service worker registration failed",
            },
          }
        );
      }
    };

    const cleanup = registerServiceWorker();

    return () => {
      if (updateCheckInterval) {
        clearInterval(updateCheckInterval);
      }
      cleanup?.then(fn => fn?.());
    };
  }, [isOnline, isUpdating]);

  // Check if already installed
  useEffect(() => {
    if (isStandalone()) {
      setIsInstalled(true);
    }
  }, []);

  // Handle beforeinstallprompt event
  useEffect(() => {
    let installPromptTimeout: NodeJS.Timeout;

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);

      // Only show banner if:
      // 1. User hasn't already dismissed it
      // 2. Online (better UX for installation)
      // 3. Not already installed
      // 4. We're on a page suitable for prompting
      if (!wasRecentlyDismissed() && isOnline && !isInstalled) {
        // Delay showing prompt to not distract on initial page load
        installPromptTimeout = setTimeout(() => {
          setShowInstallBanner(true);
        }, INSTALL_PROMPT_DELAY_MS);
      }
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setShowInstallBanner(false);
      setInstallPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      clearTimeout(installPromptTimeout);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, [isInstalled]);

  return (
    <>
      {/* Install Banner */}
      {showInstallBanner && (
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
                  Add RustAcademy to your home screen for a faster,
                  offline-ready experience.
                </p>
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={handleInstall}
                    className="flex-1 bg-white text-black text-sm font-bold py-2.5 rounded-lg hover:bg-neutral-200 transition-colors active:scale-95"
                  >
                    Install Now
                  </button>
                  <button
                    onClick={handleDismissInstall}
                    className="px-4 py-2.5 text-sm font-medium text-neutral-400 hover:text-white transition-colors"
                  >
                    Later
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Update Available Banner */}
      {showUpdateBanner && (
        <div className="fixed bottom-6 left-6 right-6 md:left-auto md:right-8 md:w-96 z-50 animate-in fade-in slide-in-from-bottom-5 duration-500">
          <div className="bg-neutral-900 border border-blue-500/20 rounded-2xl p-5 shadow-2xl backdrop-blur-xl">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-500/20">
                <svg
                  viewBox="0 0 24 24"
                  className="w-6 h-6 text-white fill-current"
                >
                  <path d="M13 7h-2v5.5H5.5v2H11V19h2v-6.5h5.5v-2H13V7z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-white">
                  Update Available
                </h3>
                <p className="text-sm text-neutral-400 mt-1">
                  A new version of RustAcademy is ready. Refresh to get the latest
                  features and improvements.
                </p>
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={handleUpdate}
                    disabled={isUpdating}
                    className="flex-1 bg-blue-600 text-white text-sm font-bold py-2.5 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                  >
                    {isUpdating ? "Updating..." : "Refresh Now"}
                  </button>
                  <button
                    onClick={handleDismissUpdate}
                    disabled={isUpdating}
                    className="px-4 py-2.5 text-sm font-medium text-neutral-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Later
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
