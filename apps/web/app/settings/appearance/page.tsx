'use client'

import React from 'react'
import { Palette, RotateCcw, Sparkles, Eye, Sliders, Check } from 'lucide-react'
import { PrivateRoute } from '@/components/auth/PrivateRoute'
import {
  ACCENT_PRESETS,
  CURATED_PRESETS,
  WALLPAPER_PRESETS,
  contrastForeground,
  contrastRatio,
  type ColorScheme,
  type DensityPreset,
  type FontScalePreset,
  type MotionPreset,
  type RadiusPreset,
} from '@/app/_theme/model'
import { useAppearance } from '@/app/_theme/provider'

export default function AppearanceSettingsPage() {
  return (
    <PrivateRoute>
      <AppearanceStudio />
    </PrivateRoute>
  )
}

function LiquidSwitch({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string
  label: string
  description: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div>
        <label htmlFor={id} className="text-sm font-medium text-slate-900 dark:text-white cursor-pointer">
          {label}
        </label>
        <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        data-checked={String(checked)}
        onClick={() => onChange(!checked)}
        className="liquid-switch"
      >
        <span className="liquid-switch-thumb" aria-hidden="true" />
      </button>
    </div>
  )
}

function AppearanceStudio() {
  const { settings, resolvedTheme, updateSettings, replaceSettings, resetSettings } = useAppearance()
  const fg = contrastForeground(settings.accentHex)
  const ratio = contrastRatio(settings.accentHex, fg)

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="glass-panel flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shadow-sm"
            style={{ background: 'var(--accent)' }}
            aria-hidden="true"
          >
            <Palette className="w-5 h-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Aparência & Liquid Glass
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Personalize materiais translúcidos, contraste WCAG, tipografia e animações
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={resetSettings}
          className="liquid-btn liquid-btn-glass inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium self-start sm:self-auto"
        >
          <RotateCcw className="w-4 h-4" aria-hidden="true" />
          Restaurar padrão
        </button>
      </div>

      {/* Curated Presets */}
      <section className="glass-panel space-y-4" aria-labelledby="presets-heading">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary-600" aria-hidden="true" />
          <h2 id="presets-heading" className="text-base font-semibold text-slate-900 dark:text-white">
            Presets Curados
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {CURATED_PRESETS.map((preset) => {
            const active =
              settings.wallpaper === preset.settings.wallpaper &&
              settings.colorScheme === preset.settings.colorScheme &&
              settings.accentHex.toUpperCase() === preset.settings.accentHex.toUpperCase() &&
              settings.reduceTransparency === preset.settings.reduceTransparency
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => replaceSettings(preset.settings)}
                aria-pressed={active}
                className={`text-left p-3.5 rounded-2xl border transition-all ${
                  active
                    ? 'liquid-nav-active ring-2 ring-primary-500/40'
                    : 'bg-white/50 dark:bg-white/5 border-white/60 dark:border-white/10 hover:bg-white/75 dark:hover:bg-white/10'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className="w-5 h-5 rounded-full border border-white/60 shadow-sm"
                    style={{ backgroundColor: preset.settings.accentHex }}
                    aria-hidden="true"
                  />
                  {active && <Check className="w-4 h-4" aria-hidden="true" />}
                </div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{preset.label}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{preset.subtitle}</p>
              </button>
            )
          })}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Theme & Colors */}
        <section className="glass-panel space-y-5" aria-labelledby="colors-heading">
          <h2 id="colors-heading" className="text-base font-semibold text-slate-900 dark:text-white">
            Tema, Cor de Destaque & Papel de Parede
          </h2>

          {/* Color Scheme */}
          <div>
            <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-2">
              Modo de cor (ativo: {resolvedTheme === 'dark' ? 'Escuro' : 'Claro'})
            </span>
            <div className="inline-flex p-1 rounded-xl bg-white/50 dark:bg-white/10 border border-white/60 dark:border-white/15">
              {(['light', 'dark', 'system'] as ColorScheme[]).map((scheme) => (
                <button
                  key={scheme}
                  type="button"
                  onClick={() => updateSettings({ colorScheme: scheme })}
                  aria-pressed={settings.colorScheme === scheme}
                  className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    settings.colorScheme === scheme
                      ? 'liquid-nav-active'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {scheme === 'light' ? 'Claro' : scheme === 'dark' ? 'Escuro' : 'Sistema'}
                </button>
              ))}
            </div>
          </div>

          {/* Accent Color */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Cor de destaque
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100/80 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 font-medium">
                Contraste WCAG {ratio}:1 {ratio >= 4.5 ? 'AA ✓' : ''}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              {ACCENT_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => updateSettings({ accentPreset: preset.id, accentHex: preset.hex })}
                  aria-label={`Cor ${preset.label}`}
                  aria-pressed={settings.accentPreset === preset.id}
                  className={`w-8 h-8 rounded-full transition-transform ${
                    settings.accentPreset === preset.id
                      ? 'ring-2 ring-offset-2 ring-slate-900 dark:ring-white scale-110'
                      : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: preset.hex }}
                  title={preset.label}
                />
              ))}
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 ml-1">
                <span>Custom:</span>
                <input
                  type="color"
                  aria-label="Cor de destaque personalizada"
                  value={settings.accentHex}
                  onChange={(e) =>
                    updateSettings({ accentPreset: 'custom', accentHex: e.target.value.toUpperCase() })
                  }
                  className="w-8 h-8 rounded-lg cursor-pointer border border-slate-300 dark:border-white/20 bg-transparent"
                />
              </label>
            </div>
          </div>

          {/* Wallpaper */}
          <div>
            <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-2">
              Fundo fluido (Ambient Canvas)
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {WALLPAPER_PRESETS.map((wp) => (
                <button
                  key={wp.id}
                  type="button"
                  onClick={() => updateSettings({ wallpaper: wp.id })}
                  aria-pressed={settings.wallpaper === wp.id}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    settings.wallpaper === wp.id
                      ? 'liquid-nav-active'
                      : 'bg-white/40 dark:bg-white/5 border-white/50 dark:border-white/10'
                  }`}
                >
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">{wp.label}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">{wp.description}</p>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Glass Calibration & Accessibility */}
        <section className="glass-panel space-y-5" aria-labelledby="glass-heading">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-primary-600" aria-hidden="true" />
            <h2 id="glass-heading" className="text-base font-semibold text-slate-900 dark:text-white">
              Calibração Liquid Glass & Acessibilidade
            </h2>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <label htmlFor="glass-opacity" className="font-medium text-slate-700 dark:text-slate-200">
                  Opacidade do vidro (piso WCAG 48%)
                </label>
                <span className="text-slate-500 dark:text-slate-400">{settings.glassOpacity}%</span>
              </div>
              <input
                id="glass-opacity"
                type="range"
                min={48}
                max={98}
                value={settings.glassOpacity}
                onChange={(e) => updateSettings({ glassOpacity: Number(e.target.value) })}
                className="w-full accent-primary-600"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <label htmlFor="glass-blur" className="font-medium text-slate-700 dark:text-slate-200">
                  Desfoque óptico (Blur)
                </label>
                <span className="text-slate-500 dark:text-slate-400">{settings.glassBlurPx}px</span>
              </div>
              <input
                id="glass-blur"
                type="range"
                min={0}
                max={32}
                value={settings.glassBlurPx}
                onChange={(e) => updateSettings({ glassBlurPx: Number(e.target.value) })}
                className="w-full accent-primary-600"
              />
            </div>

            {/* Radius & Font Scale */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label htmlFor="radius-select" className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1">
                  Cantos
                </label>
                <select
                  id="radius-select"
                  value={settings.radiusPreset}
                  onChange={(e) => updateSettings({ radiusPreset: e.target.value as RadiusPreset })}
                  className="input-base"
                >
                  <option value="classic">Clássico (12px)</option>
                  <option value="apple">Apple (18px)</option>
                  <option value="soft">Suave (24px)</option>
                </select>
              </div>
              <div>
                <label htmlFor="font-scale-select" className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1">
                  Tamanho da fonte
                </label>
                <select
                  id="font-scale-select"
                  value={settings.fontScale}
                  onChange={(e) => updateSettings({ fontScale: e.target.value as FontScalePreset })}
                  className="input-base"
                >
                  <option value="90">Compacta (90%)</option>
                  <option value="100">Padrão (100%)</option>
                  <option value="110">Ampliada (110%)</option>
                  <option value="120">Grande (120%)</option>
                </select>
              </div>
              <div>
                <label htmlFor="density-select" className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1">
                  Densidade
                </label>
                <select
                  id="density-select"
                  value={settings.density}
                  onChange={(e) => updateSettings({ density: e.target.value as DensityPreset })}
                  className="input-base"
                >
                  <option value="compact">Compacta</option>
                  <option value="comfortable">Confortável</option>
                  <option value="spacious">Espaçosa</option>
                </select>
              </div>
              <div>
                <label htmlFor="motion-select" className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1">
                  Animações
                </label>
                <select
                  id="motion-select"
                  value={settings.motion}
                  onChange={(e) => updateSettings({ motion: e.target.value as MotionPreset })}
                  className="input-base"
                >
                  <option value="spring">Apple Spring</option>
                  <option value="subtle">Sutil</option>
                  <option value="off">Desativadas</option>
                </select>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200/60 dark:border-white/10 divide-y divide-slate-200/40 dark:divide-white/10">
            <div className="flex items-center gap-2 pb-2">
              <Eye className="w-4 h-4 text-primary-600" aria-hidden="true" />
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Acessibilidade (WCAG AA)
              </span>
            </div>
            <LiquidSwitch
              id="switch-reduce-transparency"
              label="Reduzir transparência"
              description="Eleva superfícies para modo sólido (~98%) e remove blur"
              checked={settings.reduceTransparency}
              onChange={(checked) => updateSettings({ reduceTransparency: checked })}
            />
            <LiquidSwitch
              id="switch-high-contrast"
              label="Alto contraste"
              description="Reforça bordas e divisórias para leitura mais nítida"
              checked={settings.highContrast}
              onChange={(checked) => updateSettings({ highContrast: checked })}
            />
            <LiquidSwitch
              id="switch-ambient-motion"
              label="Movimento fluido de fundo"
              description="Orbes e ondas luminosas sutis no plano de fundo"
              checked={settings.ambientMotion}
              onChange={(checked) => updateSettings({ ambientMotion: checked })}
            />
          </div>
        </section>
      </div>
    </div>
  )
}
