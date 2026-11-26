"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE,
  applyAppearanceToDocument,
  getChartPalette,
  normalizeAppearanceSettings,
  resolveThemeMode,
  type AppearanceSettings,
  type ResolvedTheme,
} from "@/app/_theme/model";

type AppearanceContextValue = {
  settings: AppearanceSettings;
  resolvedTheme: ResolvedTheme;
  chartPalette: readonly string[];
  updateSettings: (patch: Partial<AppearanceSettings>) => void;
  replaceSettings: (next: AppearanceSettings) => void;
  resetSettings: () => void;
  toggleDarkMode: () => void;
  togglePrivacyMode: () => void;
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

function readStoredSettings(): AppearanceSettings {
  if (typeof window === "undefined") return { ...DEFAULT_APPEARANCE };
  try {
    const raw = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (!raw) {
      const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      const reducedTransparency =
        window.matchMedia?.("(prefers-reduced-transparency: reduce)").matches ?? false;
      return {
        ...DEFAULT_APPEARANCE,
        motion: reducedMotion ? "off" : DEFAULT_APPEARANCE.motion,
        reduceTransparency: reducedTransparency,
      };
    }
    return normalizeAppearanceSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppearanceSettings>(() => ({ ...DEFAULT_APPEARANCE }));
  const [hydrated, setHydrated] = useState(false);
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const initial = readStoredSettings();
    const updateSystem = () => setSystemDark(Boolean(media?.matches));
    updateSystem();
    setSettings(initial);
    setHydrated(true);

    media?.addEventListener?.("change", updateSystem);
    const onStorage = (event: StorageEvent) => {
      if (event.key !== APPEARANCE_STORAGE_KEY) return;
      setSettings(readStoredSettings());
    };
    window.addEventListener("storage", onStorage);
    return () => {
      media?.removeEventListener?.("change", updateSystem);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const resolvedTheme = resolveThemeMode(settings.colorScheme, systemDark);

  useEffect(() => {
    if (!hydrated) return;
    applyAppearanceToDocument(document.documentElement, settings, resolvedTheme);
    try {
      window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Ignore storage quota or private-mode failures.
    }
  }, [hydrated, settings, resolvedTheme]);

  const updateSettings = useCallback((patch: Partial<AppearanceSettings>) => {
    setSettings((current) => normalizeAppearanceSettings({ ...current, ...patch }));
  }, []);

  const replaceSettings = useCallback((next: AppearanceSettings) => {
    setSettings(normalizeAppearanceSettings(next));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings({ ...DEFAULT_APPEARANCE });
  }, []);

  const toggleDarkMode = useCallback(() => {
    setSettings((current) => {
      const nextDark = resolveThemeMode(current.colorScheme, systemDark) !== "dark";
      return normalizeAppearanceSettings({
        ...current,
        colorScheme: nextDark ? "dark" : "light",
        wallpaper: nextDark && current.wallpaper === "aurora" ? "midnight" : !nextDark && current.wallpaper === "midnight" ? "aurora" : current.wallpaper,
      });
    });
  }, [systemDark]);

  const togglePrivacyMode = useCallback(() => {
    setSettings((current) =>
      normalizeAppearanceSettings({ ...current, privacyMode: !current.privacyMode }),
    );
  }, []);

  const chartPalette = useMemo(
    () => getChartPalette(settings.colorblindMode),
    [settings.colorblindMode],
  );

  const value = useMemo(
    () => ({
      settings,
      resolvedTheme,
      chartPalette,
      updateSettings,
      replaceSettings,
      resetSettings,
      toggleDarkMode,
      togglePrivacyMode,
    }),
    [settings, resolvedTheme, chartPalette, updateSettings, replaceSettings, resetSettings, toggleDarkMode, togglePrivacyMode],
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance(): AppearanceContextValue {
  const context = useContext(AppearanceContext);
  if (!context) {
    return {
      settings: DEFAULT_APPEARANCE,
      resolvedTheme: "light",
      chartPalette: getChartPalette(false),
      updateSettings: () => undefined,
      replaceSettings: () => undefined,
      resetSettings: () => undefined,
      toggleDarkMode: () => undefined,
      togglePrivacyMode: () => undefined,
    };
  }
  return context;
}
