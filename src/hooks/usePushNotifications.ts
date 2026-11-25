import { useCallback, useEffect, useState } from 'react';

export type PushPermissionState = NotificationPermission | 'unsupported';

export function usePushNotifications() {
  const [permission, setPermission] = useState<PushPermissionState>(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'unsupported';
    }
    return Notification.permission;
  });

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = useCallback(async (): Promise<PushPermissionState> => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPermission('unsupported');
      return 'unsupported';
    }
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result;
    } catch {
      return permission;
    }
  }, [permission]);

  const sendPushNotification = useCallback(
    async (title: string, body: string, tag?: string) => {
      if (typeof window === 'undefined' || !('Notification' in window)) return;
      if (Notification.permission !== 'granted') return;

      try {
        if ('serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg && 'showNotification' in reg) {
            await reg.showNotification(title, {
              body,
              icon: '/pwa-192x192.png',
              badge: '/pwa-192x192.png',
              tag: tag || 'pustakakita-alert',
            });
            return;
          }
        }
        new Notification(title, {
          body,
          icon: '/pwa-192x192.png',
          tag: tag || 'pustakakita-alert',
        });
      } catch {
        // Silently ignore notification block in headless/iframe contexts
      }
    },
    []
  );

  return {
    permission,
    requestPermission,
    sendPushNotification,
  };
}
