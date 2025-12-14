export type TelegramWebApp = {
  ready: () => void;
  expand?: () => void;
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
    // TODO: validate tg.initData on backend for production security.
  } catch (err) {
    console.warn("Telegram init failed", err);
  }
  return tg;
};
