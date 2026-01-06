export type SafeAreaInset = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export type TelegramWebApp = {
  ready: () => void;
  expand?: () => void;
  requestFullscreen?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  disableVerticalSwipes?: () => void;
  isFullscreen?: boolean;
  safeAreaInset?: SafeAreaInset;
  contentSafeAreaInset?: SafeAreaInset;
  initData?: string;
};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

export const getTelegram = (): TelegramWebApp | null => {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
};

export const getSafeAreaInsets = (): SafeAreaInset => {
  const tg = getTelegram();
  const defaultInsets = { top: 0, bottom: 0, left: 0, right: 0 };

  if (!tg) return defaultInsets;

  // Берём максимум из safeAreaInset и contentSafeAreaInset
  const safe = tg.safeAreaInset ?? defaultInsets;
  const content = tg.contentSafeAreaInset ?? defaultInsets;

  return {
    top: Math.max(safe.top, content.top),
    bottom: Math.max(safe.bottom, content.bottom),
    left: Math.max(safe.left, content.left),
    right: Math.max(safe.right, content.right),
  };
};

export const initTelegram = () => {
  const tg = getTelegram();
  if (!tg) return null;
  try {
    tg.ready();
    tg.expand?.();

    // Настройки для полноэкранного режима
    tg.setHeaderColor?.("#0d0f1a");
    tg.setBackgroundColor?.("#0d0f1a");
    tg.disableVerticalSwipes?.();

    // Запрос полноэкранного режима (Bot API 8.0+)
    tg.requestFullscreen?.();

    // TODO: validate tg.initData on backend for production security.
  } catch (err) {
    console.warn("Telegram init failed", err);
  }
  return tg;
};
