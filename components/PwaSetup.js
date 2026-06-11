'use client';
import { useEffect } from 'react';

// Registers the service worker (production only — in dev a SW just
// confuses hot reload). Mounted once in the root layout.
export default function PwaSetup() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  return null;
}
