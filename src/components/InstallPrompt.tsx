"use client";

import { useEffect, useState, useCallback } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    // Already running as installed PWA
    if (window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone) {
      setIsStandalone(true);
      return;
    }

    // Previously dismissed
    try {
      if (sessionStorage.getItem("ss-install-dismissed")) {
        setDismissed(true);
        return;
      }
    } catch { /* private browsing */ }

    // Chrome/Edge: capture the native install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // Safari/Firefox: show manual hint
    const ua = navigator.userAgent;
    if (/Safari/.test(ua) && !/Chrome/.test(ua)) {
      // Safari (macOS or iOS)
      if (/iPhone|iPad|iPod/.test(ua)) {
        setHint("Tap the share button, then \"Add to Home Screen\"");
      } else {
        setHint("File → Add to Dock to install as a desktop app");
      }
    } else if (/Firefox/.test(ua)) {
      setHint("Firefox doesn't support PWA install — try Chrome or Edge");
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const dismiss = useCallback(() => {
    setDismissed(true);
    setDeferredPrompt(null);
    setHint(null);
    try { sessionStorage.setItem("ss-install-dismissed", "1"); } catch { /* ok */ }
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setIsStandalone(true);
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  if (isStandalone || dismissed || (!deferredPrompt && !hint)) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "calc(var(--transport-height, 48px) + 8px)",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 14px",
        borderRadius: 10,
        background: "rgba(30, 30, 30, 0.92)",
        border: "1px solid rgba(255,255,255,0.08)",
        backdropFilter: "blur(12px)",
        maxWidth: "calc(100vw - 32px)",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-body, var(--ff-body))",
          fontSize: 12,
          color: "rgba(245, 240, 235, 0.6)",
        }}
      >
        {deferredPrompt ? "Install streamscapes as a desktop app" : hint}
      </span>
      {deferredPrompt && (
        <button
          onClick={install}
          style={{
            fontFamily: "var(--font-display, var(--ff-display))",
            fontSize: 11,
            fontWeight: 500,
            padding: "4px 10px",
            borderRadius: 6,
            background: "rgba(124, 68, 79, 0.3)",
            color: "rgba(245, 240, 235, 0.8)",
            border: "1px solid rgba(124, 68, 79, 0.4)",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Install
        </button>
      )}
      <button
        onClick={dismiss}
        style={{
          background: "none",
          border: "none",
          color: "rgba(245, 240, 235, 0.3)",
          fontSize: 16,
          cursor: "pointer",
          padding: "0 2px",
          lineHeight: 1,
        }}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
