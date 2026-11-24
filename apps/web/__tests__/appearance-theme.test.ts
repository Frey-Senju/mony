import {
  DEFAULT_APPEARANCE,
  CURATED_PRESETS,
  contrastForeground,
  contrastRatio,
  normalizeAppearanceSettings,
  resolveThemeMode,
  sanitizeHexColor,
} from '@/app/_theme/model'

describe('Liquid Glass Appearance Model', () => {
  it('returns defaults for invalid input', () => {
    expect(normalizeAppearanceSettings(null)).toEqual(DEFAULT_APPEARANCE)
    expect(normalizeAppearanceSettings('invalid')).toEqual(DEFAULT_APPEARANCE)
  })

  it('clamps glass opacity to WCAG safe floor (48..98) and blur (0..32)', () => {
    const normalized = normalizeAppearanceSettings({
      glassOpacity: 10,
      glassBlurPx: 99,
      glassSaturation: 500,
    })
    expect(normalized.glassOpacity).toBe(48)
    expect(normalized.glassBlurPx).toBe(32)
    expect(normalized.glassSaturation).toBe(220)
  })

  it('sanitizes hex colors and picks WCAG AA contrasting foreground', () => {
    expect(sanitizeHexColor('#059669')).toBe('#059669')
    expect(sanitizeHexColor('not-a-color')).toBe(DEFAULT_APPEARANCE.accentHex)

    // Dark blue gets white foreground with >= 4.5 contrast
    expect(contrastForeground('#0071E3')).toBe('#FFFFFF')
    expect(contrastRatio('#0071E3', '#FFFFFF')).toBeGreaterThanOrEqual(4.5)

    // Bright yellow gets dark slate foreground
    expect(contrastForeground('#FDE047')).toBe('#0F172A')
    expect(contrastRatio('#FDE047', '#0F172A')).toBeGreaterThanOrEqual(4.5)
  })

  it('resolves system color scheme properly', () => {
    expect(resolveThemeMode('system', true)).toBe('dark')
    expect(resolveThemeMode('system', false)).toBe('light')
    expect(resolveThemeMode('dark', false)).toBe('dark')
    expect(resolveThemeMode('light', true)).toBe('light')
  })

  it('includes a WCAG focus preset with reduceTransparency and highContrast enabled', () => {
    const wcag = CURATED_PRESETS.find((p) => p.id === 'wcag-focus')
    expect(wcag).toBeDefined()
    expect(wcag?.settings.reduceTransparency).toBe(true)
    expect(wcag?.settings.highContrast).toBe(true)
    expect(wcag?.settings.motion).toBe('off')
  })
})
