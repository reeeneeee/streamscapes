"use client";

import { useEffect } from "react";

export default function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // Force-clear old caches and re-register fresh SW
    caches.keys().then((keys) => {
      for (const key of keys) caches.delete(key);
    });

    navigator.serviceWorker.getRegistrations().then((regs) => {
      for (const reg of regs) reg.unregister();
    }).then(() => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }, []);
  return null;
}
