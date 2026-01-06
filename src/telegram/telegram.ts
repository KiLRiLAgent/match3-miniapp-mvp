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
  viewportHeight?: number;
  viewportStableHeight?: number;
  safeAreaInset?: SafeAreaInset;
  contentSafeAreaInset?: SafeAreaInset;
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

// Получение безопасных размеров viewport с учётом safe area
export const getSafeViewport = () => {
  const tg = getTelegram();

  if (!tg) {
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      safeTop: 0,
      safeBottom: 0,
    };
  }

  // Используем viewportStableHeight - стабильная высота, не меняется при свайпах
  const height = tg.viewportStableHeight ?? tg.viewportHeight ?? window.innerHeight;

  // Суммируем system safe area и content safe area
  const safeTop = (tg.safeAreaInset?.top ?? 0) + (tg.contentSafeAreaInset?.top ?? 0);
  const safeBottom = (tg.safeAreaInset?.bottom ?? 0) + (tg.contentSafeAreaInset?.bottom ?? 0);

  return {
    width: window.innerWidth,
    height,
    safeTop,
    safeBottom,
  };
};
