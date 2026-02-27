'use client';

import { useEffect, useState } from 'react';

export function ServiceWorkerRegistration() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && 'serviceWorker' in navigator && window.location.hostname !== 'localhost') {
      navigator.serviceWorker.register('/sw.js').then(
        (registration) => {
          console.log('SW registered:', registration);
        },
        (error) => {
          console.log('SW registration failed:', error);
        }
      );
    }
  }, [mounted]);

  return null;
}
