export type ColorScheme = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";
export type AccentPreset =
  | "blue"
  | "emerald"
  | "indigo"
  | "purple"
  | "pink"
  | "orange"
  | "graphite"
  | "custom";
export type WallpaperPreset = "aurora" | "ocean" | "sunset" | "mist" | "midnight" | "minimal";
export type RadiusPreset = "classic" | "apple" | "soft";
export type DensityPreset = "compact" | "comfortable" | "spacious";
export type FontScalePreset = "90" | "100" | "110" | "120";
export type MotionPreset = "spring" | "subtle" | "off";

export type AppearanceSettings = {
  colorScheme: ColorScheme;
  accentPreset: AccentPreset;
  accentHex: string;
  wallpaper: WallpaperPreset;
  wallpaperIntensity: number; // 0..100
  glassOpacity: number; // 48..98
  glassBlurPx: number; // 0..32
  glassSaturation: number; // 100..220
  specularBorder: boolean;
  radiusPreset: RadiusPreset;
  density: DensityPreset;
  fontScale: FontScalePreset;
  motion: MotionPreset;
  ambientMotion: boolean;
  liquidRefraction: boolean;
  reduceTransparency: boolean;
  highContrast: boolean;
  colorblindMode: boolean;
  privacyMode: boolean;
  comfortableReading: boolean;
};

export const CHART_PALETTE_DEFAULT = [
  "#0071E3",
  "#10B981",
  "#8B5CF6",
  "#F59E0B",
  "#EC4899",
  "#06B6D4",
] as const;

export const CHART_PALETTE_OKABE_ITO = [
  "#0072B2",
  "#009E73",
  "#E69F00",
  "#CC79A7",
  "#56B4E9",
  "#D55E00",
] as const;

export function getChartPalette(colorblindMode: boolean): readonly string[] {
  return colorblindMode ? CHART_PALETTE_OKABE_ITO : CHART_PALETTE_DEFAULT;
}

export const APPEARANCE_STORAGE_KEY = "mony_appearance_v1";

export const ACCENT_PRESETS: ReadonlyArray<{
  id: Exclude<AccentPreset, "custom">;
  label: string;
  hex: string;
}> = [
  { id: "blue", label: "Azul Apple", hex: "#0071E3" },
  { id: "emerald", label: "Esmeralda Mony", hex: "#059669" },
  { id: "indigo", label: "Índigo", hex: "#4F46E5" },
  { id: "purple", label: "Roxo", hex: "#7C3AED" },
  { id: "pink", label: "Rosa", hex: "#DB2777" },
  { id: "orange", label: "Laranja", hex: "#EA580C" },
  { id: "graphite", label: "Grafite", hex: "#334155" },
];

export const WALLPAPER_PRESETS: ReadonlyArray<{
  id: WallpaperPreset;
  label: string;
  description: string;
}> = [
  { id: "aurora", label: "Aurora Glacial", description: "Gradiente luminoso estilo macOS Tahoe" },
  { id: "ocean", label: "Oceano Pacífico", description: "Tons frios de azul, ciano e esmeralda" },
  { id: "sunset", label: "Crepúsculo Executivo", description: "Brilho suave âmbar e lavanda" },
  { id: "mist", label: "Névoa Neutra", description: "Cinza mineral discreto e limpo" },
  { id: "midnight", label: "Grafite Noturno", description: "Profundidade índigo escura" },
  { id: "minimal", label: "Minimalista Sólido", description: "Fundo neutro sem gradiente" },
];

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  colorScheme: "light",
  accentPreset: "blue",
  accentHex: "#0071E3",
  wallpaper: "aurora",
  wallpaperIntensity: 92,
  glassOpacity: 68,
  glassBlurPx: 24,
  glassSaturation: 195,
  specularBorder: true,
  radiusPreset: "apple",
  density: "comfortable",
  fontScale: "100",
  motion: "spring",
  ambientMotion: true,
  liquidRefraction: true,
  reduceTransparency: false,
  highContrast: false,
  colorblindMode: false,
  privacyMode: false,
  comfortableReading: false,
};

export type CuratedThemePreset = {
  id: string;
  label: string;
  subtitle: string;
  settings: AppearanceSettings;
};

export const CURATED_PRESETS: readonly CuratedThemePreset[] = [
  {
    id: "tahoe",
    label: "Apple Tahoe",
    subtitle: "Aurora clara · Liquid Glass",
    settings: { ...DEFAULT_APPEARANCE },
  },
  {
    id: "mony-emerald",
    label: "Mony Esmeralda",
    subtitle: "Oceano luminoso · Verde financeiro",
    settings: {
      ...DEFAULT_APPEARANCE,
      colorScheme: "light",
      accentPreset: "emerald",
      accentHex: "#059669",
      wallpaper: "ocean",
      wallpaperIntensity: 88,
      glassOpacity: 68,
      glassBlurPx: 24,
      glassSaturation: 195,
    },
  },
  {
    id: "obsidian",
    label: "Obsidian Pro",
    subtitle: "Escuro fumê · Faixas luminosas",
    settings: {
      ...DEFAULT_APPEARANCE,
      colorScheme: "dark",
      accentPreset: "indigo",
      accentHex: "#6366F1",
      wallpaper: "midnight",
      wallpaperIntensity: 95,
      glassOpacity: 60,
      glassBlurPx: 24,
      glassSaturation: 190,
      ambientMotion: true,
      liquidRefraction: true,
    },
  },
  {
    id: "studio",
    label: "Studio Minimal",
    subtitle: "Névoa neutra · Grafite limpo",
    settings: {
      ...DEFAULT_APPEARANCE,
      colorScheme: "light",
      accentPreset: "graphite",
      accentHex: "#334155",
      wallpaper: "mist",
      wallpaperIntensity: 70,
      glassOpacity: 80,
      glassBlurPx: 16,
      glassSaturation: 150,
      radiusPreset: "classic",
    },
  },
  {
    id: "wcag-focus",
    label: "Foco Máximo (WCAG)",
    subtitle: "Sólido · Alto contraste · Sem movimento",
    settings: {
      ...DEFAULT_APPEARANCE,
      colorScheme: "light",
      accentPreset: "blue",
      accentHex: "#0055B3",
      wallpaper: "minimal",
      wallpaperIntensity: 0,
      glassOpacity: 98,
      glassBlurPx: 0,
      glassSaturation: 100,
      specularBorder: false,
      motion: "off",
      ambientMotion: false,
      liquidRefraction: false,
      reduceTransparency: true,
      highContrast: true,
      colorblindMode: true,
      comfortableReading: true,
    },
  },
];

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(Math.max(Math.round(num), min), max);
}

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

export function sanitizeHexColor(value: unknown, fallback = DEFAULT_APPEARANCE.accentHex): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return HEX_RE.test(trimmed) ? trimmed.toUpperCase() : fallback;
}

export function normalizeAppearanceSettings(input: unknown): AppearanceSettings {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ...DEFAULT_APPEARANCE };
  }
  const raw = input as Record<string, unknown>;
  const accentPreset = pickEnum<AccentPreset>(
    raw.accentPreset,
    ["blue", "emerald", "indigo", "purple", "pink", "orange", "graphite", "custom"],
    DEFAULT_APPEARANCE.accentPreset,
  );
  const matchedPreset = ACCENT_PRESETS.find((p) => p.id === accentPreset);
  const accentHex =
    accentPreset === "custom"
      ? sanitizeHexColor(raw.accentHex, DEFAULT_APPEARANCE.accentHex)
      : sanitizeHexColor(raw.accentHex, matchedPreset?.hex ?? DEFAULT_APPEARANCE.accentHex);

  return {
    colorScheme: pickEnum<ColorScheme>(raw.colorScheme, ["system", "light", "dark"], DEFAULT_APPEARANCE.colorScheme),
    accentPreset,
    accentHex,
    wallpaper: pickEnum<WallpaperPreset>(
      raw.wallpaper,
      ["aurora", "ocean", "sunset", "mist", "midnight", "minimal"],
      DEFAULT_APPEARANCE.wallpaper,
    ),
    wallpaperIntensity: clampInt(raw.wallpaperIntensity, DEFAULT_APPEARANCE.wallpaperIntensity, 0, 100),
    glassOpacity: clampInt(raw.glassOpacity, DEFAULT_APPEARANCE.glassOpacity, 48, 98),
    glassBlurPx: clampInt(raw.glassBlurPx, DEFAULT_APPEARANCE.glassBlurPx, 0, 32),
    glassSaturation: clampInt(raw.glassSaturation, DEFAULT_APPEARANCE.glassSaturation, 100, 220),
    specularBorder: typeof raw.specularBorder === "boolean" ? raw.specularBorder : DEFAULT_APPEARANCE.specularBorder,
    radiusPreset: pickEnum<RadiusPreset>(raw.radiusPreset, ["classic", "apple", "soft"], DEFAULT_APPEARANCE.radiusPreset),
    density: pickEnum<DensityPreset>(raw.density, ["compact", "comfortable", "spacious"], DEFAULT_APPEARANCE.density),
    fontScale: pickEnum<FontScalePreset>(raw.fontScale, ["90", "100", "110", "120"], DEFAULT_APPEARANCE.fontScale),
    motion: pickEnum<MotionPreset>(raw.motion, ["spring", "subtle", "off"], DEFAULT_APPEARANCE.motion),
    ambientMotion: typeof raw.ambientMotion === "boolean" ? raw.ambientMotion : DEFAULT_APPEARANCE.ambientMotion,
    liquidRefraction: typeof raw.liquidRefraction === "boolean" ? raw.liquidRefraction : DEFAULT_APPEARANCE.liquidRefraction,
    reduceTransparency: typeof raw.reduceTransparency === "boolean" ? raw.reduceTransparency : DEFAULT_APPEARANCE.reduceTransparency,
    highContrast: typeof raw.highContrast === "boolean" ? raw.highContrast : DEFAULT_APPEARANCE.highContrast,
    colorblindMode: typeof raw.colorblindMode === "boolean" ? raw.colorblindMode : DEFAULT_APPEARANCE.colorblindMode,
    privacyMode: typeof raw.privacyMode === "boolean" ? raw.privacyMode : DEFAULT_APPEARANCE.privacyMode,
    comfortableReading: typeof raw.comfortableReading === "boolean" ? raw.comfortableReading : DEFAULT_APPEARANCE.comfortableReading,
  };
}

export function hexToRgb(hex: string): [number, number, number] {
  const safe = sanitizeHexColor(hex);
  return [
    Number.parseInt(safe.slice(1, 3), 16),
    Number.parseInt(safe.slice(3, 5), 16),
    Number.parseInt(safe.slice(5, 7), 16),
  ];
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((channel) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(hexA: string, hexB: string): number {
  const lumA = relativeLuminance(hexA);
  const lumB = relativeLuminance(hexB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

export function contrastForeground(hex: string): "#FFFFFF" | "#0F172A" {
  return relativeLuminance(hex) > 0.38 ? "#0F172A" : "#FFFFFF";
}

export function darkenHex(hex: string, factor = 0.14): string {
  const [r, g, b] = hexToRgb(hex).map((v) => Math.max(0, Math.round(v * (1 - factor))));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

export const RADIUS_VALUES: Record<RadiusPreset, { card: string; control: string }> = {
  classic: { card: "12px", control: "8px" },
  apple: { card: "18px", control: "12px" },
  soft: { card: "24px", control: "15px" },
};

export function resolveThemeMode(colorScheme: ColorScheme, prefersDark: boolean): ResolvedTheme {
  if (colorScheme === "system") return prefersDark ? "dark" : "light";
  return colorScheme;
}

export function applyAppearanceToDocument(
  root: HTMLElement,
  settings: AppearanceSettings,
  resolvedTheme: ResolvedTheme,
) {
  const [r, g, b] = hexToRgb(settings.accentHex);
  const accentFg = contrastForeground(settings.accentHex);
  const accentHover = darkenHex(settings.accentHex, 0.14);
  const radius = RADIUS_VALUES[settings.radiusPreset];
  const cardAlpha = settings.reduceTransparency ? 0.97 : settings.glassOpacity / 100;
  const chromeAlpha = settings.reduceTransparency
    ? 0.96
    : Math.max(0.46, (settings.glassOpacity - 8) / 100);
  const blurPx = settings.reduceTransparency ? 0 : settings.glassBlurPx;
  const satPct = settings.reduceTransparency ? 100 : settings.glassSaturation;

  root.dataset.theme = resolvedTheme;
  root.dataset.wallpaper = settings.wallpaper;
  root.dataset.density = settings.density;
  root.dataset.motion = settings.motion;
  root.dataset.ambientMotion = String(
    settings.ambientMotion && settings.motion !== "off" && !settings.reduceTransparency,
  );
  root.dataset.liquidRefraction = String(settings.liquidRefraction && !settings.reduceTransparency);
  root.dataset.specular = String(settings.specularBorder && !settings.reduceTransparency);
  root.dataset.reduceTransparency = String(settings.reduceTransparency);
  root.dataset.highContrast = String(settings.highContrast);
  root.dataset.colorblind = String(settings.colorblindMode);
  root.dataset.privacy = String(settings.privacyMode);
  root.dataset.reading = settings.comfortableReading ? "comfortable" : "default";
  root.dataset.fontScale = settings.fontScale;

  root.style.setProperty("--accent", settings.accentHex);
  root.style.setProperty("--accent-hover", accentHover);
  root.style.setProperty("--accent-fg", accentFg);
  root.style.setProperty("--accent-rgb", `${r} ${g} ${b}`);
  root.style.setProperty("--accent-soft", `rgba(${r}, ${g}, ${b}, ${resolvedTheme === "dark" ? 0.24 : 0.12})`);
  root.style.setProperty("--color-primary", settings.accentHex);
  root.style.setProperty("--color-primary-hover", accentHover);
  root.style.setProperty("--glass-card-alpha", String(cardAlpha));
  root.style.setProperty("--glass-chrome-alpha", String(chromeAlpha));
  root.style.setProperty("--glass-blur", `${blurPx}px`);
  root.style.setProperty("--glass-saturation", `${satPct}%`);
  root.style.setProperty("--glass-bg-intensity", String(settings.wallpaperIntensity / 100));
  root.style.setProperty("--radius-card", radius.card);
  root.style.setProperty("--radius-control", radius.control);
}

/**
 * Minimal synchronous pre-hydration script to prevent theme flicker (FOUC).
 */
export const APPEARANCE_BOOTSTRAP_SCRIPT = `(function(){try{var k=${JSON.stringify(APPEARANCE_STORAGE_KEY)};var raw=localStorage.getItem(k);var s=raw?JSON.parse(raw):null;var cs=s&&s.colorScheme||"light";var dark=cs==="dark"||(cs==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var rm=window.matchMedia("(prefers-reduced-motion: reduce)").matches;var d=document.documentElement;var mot=s&&s.motion||(rm?"off":"spring");var rt=Boolean(s&&s.reduceTransparency);d.dataset.theme=dark?"dark":"light";d.dataset.wallpaper=s&&s.wallpaper||"aurora";d.dataset.density=s&&s.density||"comfortable";d.dataset.motion=mot;d.dataset.ambientMotion=String((s&&typeof s.ambientMotion==="boolean"?s.ambientMotion:true)&&mot!=="off"&&!rt);d.dataset.liquidRefraction=String((s&&typeof s.liquidRefraction==="boolean"?s.liquidRefraction:true)&&!rt);d.dataset.reduceTransparency=String(rt);d.dataset.highContrast=String(Boolean(s&&s.highContrast));d.dataset.fontScale=s&&s.fontScale||"100";}catch(e){}})();`;
