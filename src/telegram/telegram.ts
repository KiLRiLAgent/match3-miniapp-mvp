export type TelegramWebApp = {
  ready: () => void;
  expand?: () => void;
  requestFullscreen?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  disableVerticalSwipes?: () => void;
  isFullscreen?: boolean;
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
