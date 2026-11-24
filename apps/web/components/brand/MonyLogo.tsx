'use client'

import React, { useId } from 'react'
import { useAppearance } from '@/app/_theme/provider'

export interface MonyLogoProps {
  size?: 'sm' | 'md' | 'lg'
  showWordmark?: boolean
  className?: string
}

const DIMENSIONS = {
  sm: 38,
  md: 46,
  lg: 64,
}

const M_PATH =
  'M 54 50 H 91 L 120 123 L 149 50 H 186 V 190 H 155 V 103 L 130 165 H 110 L 85 103 V 190 H 54 Z'

const WAVE_PATH =
  'M 47 146 C 24 146, 22 104, 52 104 C 70 104, 72 142, 86 142 C 97 142, 96 105, 113 105 C 127 105, 128 142, 141 142 C 151 142, 151 104, 168 104 C 186 104, 190 142, 203 136 C 216 130, 212 105, 196 108'

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = (hex || '#0071E3').replace('#', '')
  const expanded =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.padEnd(6, '0').slice(0, 6)
  const n = Number.parseInt(expanded, 16)
  if (Number.isNaN(n)) return { r: 0, g: 113, b: 227 }
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function mixColor(
  hex: string,
  target: { r: number; g: number; b: number },
  ratio: number
): string {
  const c = hexToRgb(hex)
  const r = Math.round(c.r + (target.r - c.r) * ratio)
  const g = Math.round(c.g + (target.g - c.g) * ratio)
  const b = Math.round(c.b + (target.b - c.b) * ratio)
  return `rgb(${r}, ${g}, ${b})`
}

/**
 * Animated Apple Liquid Glass "M" Logo.
 *
 * Bold geometric "M" tinted dynamically by the active theme accent color,
 * crossed by a continuously animated refractive Liquid Glass wave with
 * live optical magnification, diagonal caustic light bands, and gliding specular rims.
 */
export function MonyLogo({ size = 'md', showWordmark = true, className = '' }: MonyLogoProps) {
  const uid = useId().replace(/:/g, '')
  const { settings, resolvedTheme } = useAppearance()
  const dim = DIMENSIONS[size]
  const hex = settings.accentHex || '#0071E3'
  const isDark = resolvedTheme === 'dark'
  const rgb = hexToRgb(hex)

  const cTop = isDark
    ? mixColor(hex, { r: 255, g: 255, b: 255 }, 0.3)
    : mixColor(hex, { r: 255, g: 255, b: 255 }, 0.08)
  const cMid = hex
  const cBot = isDark
    ? mixColor(hex, { r: 0, g: 0, b: 0 }, 0.18)
    : mixColor(hex, { r: 0, g: 0, b: 0 }, 0.32)
  const cDeep = mixColor(hex, { r: 0, g: 0, b: 0 }, isDark ? 0.42 : 0.62)
  const cTint = mixColor(hex, { r: 255, g: 255, b: 255 }, 0.58)
  const cRim = isDark
    ? mixColor(hex, { r: 255, g: 255, b: 255 }, 0.68)
    : 'rgba(15, 23, 42, 0.52)'

  return (
    <span className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      <span
        className="mony-logo-orb relative inline-flex items-center justify-center shrink-0 rounded-2xl"
        style={{ width: dim, height: dim }}
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 240 240"
          width={dim}
          height={dim}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full overflow-visible block"
        >
          <defs>
            {/* Theme-reactive M fill gradient */}
            <linearGradient id={`mFill-${uid}`} x1="54" y1="50" x2="186" y2="190" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor={cTop} />
              <stop offset="52%" stopColor={cMid} />
              <stop offset="100%" stopColor={cBot} />
            </linearGradient>

            {/* Optically refracted M gradient inside the liquid glass tube */}
            <linearGradient id={`mRefract-${uid}`} x1="54" y1="50" x2="186" y2="190" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor={cTint} />
              <stop offset="48%" stopColor={cMid} />
              <stop offset="100%" stopColor={cDeep} />
            </linearGradient>

            {/* Liquid glass translucent body tint */}
            <linearGradient id={`glassBody-${uid}`} x1="30" y1="96" x2="210" y2="152" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor={`rgba(255,255,255,${isDark ? '0.28' : '0.46'})`} />
              <stop offset="35%" stopColor={`rgba(${rgb.r},${rgb.g},${rgb.b},${isDark ? '0.24' : '0.14'})`} />
              <stop offset="68%" stopColor={`rgba(255,255,255,${isDark ? '0.18' : '0.38'})`} />
              <stop offset="100%" stopColor={`rgba(${rgb.r},${rgb.g},${rgb.b},${isDark ? '0.32' : '0.18'})`} />
            </linearGradient>

            {/* Top cylindrical specular highlight */}
            <linearGradient id={`specTop-${uid}`} x1="30" y1="100" x2="210" y2="140" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="rgba(255,255,255,0.95)" />
              <stop offset="40%" stopColor="rgba(255,255,255,0.45)" />
              <stop offset="70%" stopColor="rgba(255,255,255,0.92)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0.65)" />
            </linearGradient>

            {/* Diagonal flowing caustic light bands */}
            <linearGradient id={`causticBand-${uid}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="rgba(255,255,255,0)" />
              <stop offset="40%" stopColor="rgba(255,255,255,0.68)" />
              <stop offset="55%" stopColor={`rgba(${rgb.r},${rgb.g},${rgb.b},0.35)`} />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </linearGradient>

            {/* Subtle diagonal sheen on the M */}
            <linearGradient id={`mSheen-${uid}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="rgba(255,255,255,0)" />
              <stop offset="50%" stopColor="rgba(255,255,255,0.42)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </linearGradient>

            {/* Real optical glass refraction displacement filter */}
            <filter id={`glassLens-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.018 0.032"
                numOctaves={2}
                seed={7}
                result="noise"
              >
                <animate
                  attributeName="baseFrequency"
                  values="0.016 0.028;0.024 0.040;0.016 0.028"
                  dur="5.5s"
                  repeatCount="indefinite"
                />
              </feTurbulence>
              <feDisplacementMap
                in="SourceGraphic"
                in2="noise"
                scale={11}
                xChannelSelector="R"
                yChannelSelector="G"
                result="warped"
              />
              <feGaussianBlur in="warped" stdDeviation="0.55" />
            </filter>

            {/* Soft cast shadow under glass ribbon */}
            <filter id={`glassShadow-${uid}`} x="-25%" y="-25%" width="150%" height="150%">
              <feDropShadow
                dx="0"
                dy="5"
                stdDeviation="4.5"
                floodColor={isDark ? '#000000' : cDeep}
                floodOpacity={isDark ? 0.55 : 0.3}
              />
            </filter>

            {/* Clip path for M */}
            <clipPath id={`clipM-${uid}`}>
              <path d={M_PATH} />
            </clipPath>

            {/* Mask shaped as the thick liquid glass wave */}
            <mask id={`maskWave-${uid}`}>
              <rect width="240" height="240" fill="black" />
              <path
                d={WAVE_PATH}
                stroke="white"
                strokeWidth="25"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </mask>
          </defs>

          {/* Layer 1: Bold Theme-Colored Geometric M */}
          <path d={M_PATH} fill={`url(#mFill-${uid})`} />

          {/* Continuous subtle sheen gliding across M */}
          <g clipPath={`url(#clipM-${uid})`}>
            <rect
              className="mony-lg-m-sheen"
              x="30"
              y="30"
              width="60"
              height="190"
              fill={`url(#mSheen-${uid})`}
              transform="skewX(-18)"
            />
          </g>

          {/* Layer 2..6: Continuously Animated Living Liquid Glass Wave */}
          <g className="mony-lg-ribbon">
            {/* Soft cast shadow onto the M */}
            <path
              d={WAVE_PATH}
              stroke="rgba(0,0,0,0.22)"
              strokeWidth="25"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter={`url(#glassShadow-${uid})`}
              opacity={0.7}
            />

            {/* Optically Refracted M + Flowing Caustic Light Bands strictly inside the glass wave */}
            <g mask={`url(#maskWave-${uid})`}>
              <rect width="240" height="240" fill={`url(#glassBody-${uid})`} />

              <g
                transform="translate(120 124) scale(1.075, 1.13) translate(-120 -124)"
                filter={`url(#glassLens-${uid})`}
              >
                <path d={M_PATH} fill={`url(#mRefract-${uid})`} opacity={isDark ? 0.92 : 0.88} />
              </g>

              {/* Diagonal caustic light beams sweeping across the glass */}
              <g className="mony-lg-caustics-a" opacity={isDark ? 0.78 : 0.88}>
                <rect x="-40" y="10" width="22" height="220" fill={`url(#causticBand-${uid})`} />
                <rect x="-6" y="10" width="12" height="220" fill={`url(#causticBand-${uid})`} opacity={0.75} />
                <rect x="20" y="10" width="16" height="220" fill={`url(#causticBand-${uid})`} opacity={0.6} />
              </g>
              <g className="mony-lg-caustics-b" opacity={isDark ? 0.52 : 0.62}>
                <rect x="-20" y="10" width="14" height="220" fill={`url(#causticBand-${uid})`} />
                <rect x="10" y="10" width="24" height="220" fill={`url(#causticBand-${uid})`} opacity={0.7} />
              </g>

              {/* Cylindrical lower inner depth shading */}
              <path
                d={WAVE_PATH}
                transform="translate(0, 5.5)"
                stroke={cDeep}
                strokeWidth="21"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={isDark ? 0.32 : 0.26}
              />

              {/* Bright top-edge internal reflection cushion */}
              <path
                d={WAVE_PATH}
                transform="translate(0, -5.2)"
                stroke={`rgba(255,255,255,${isDark ? '0.45' : '0.78'})`}
                strokeWidth="11"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>

            {/* Total-internal-reflection crisp glass border */}
            <path
              d={WAVE_PATH}
              stroke={cRim}
              strokeWidth="26.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={isDark ? 0.52 : 0.62}
              style={{ mixBlendMode: isDark ? 'screen' : 'multiply' }}
              mask={`url(#maskWave-${uid})`}
            />

            {/* Subtle outer specular rim */}
            <path
              d={WAVE_PATH}
              stroke={`rgba(255,255,255,${isDark ? '0.65' : '0.90'})`}
              strokeWidth="25"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.22}
            />

            {/* Razor-sharp upper glossy specular ridge */}
            <path
              d={WAVE_PATH}
              transform="translate(0, -6.4)"
              stroke={`url(#specTop-${uid})`}
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.92}
            />

            {/* Continuous traveling liquid highlight along the glass wave */}
            <path
              className="mony-lg-glint-a"
              d={WAVE_PATH}
              transform="translate(0, -6.2)"
              stroke="white"
              strokeWidth="4.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.95}
            />

            {/* Counter-flowing lower theme-tinted caustic glint */}
            <path
              className="mony-lg-glint-b"
              d={WAVE_PATH}
              transform="translate(0, 7.2)"
              stroke={cTint}
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.88}
            />
          </g>
        </svg>
      </span>

      {showWordmark && (
        <span className="font-bold tracking-tight text-slate-900 dark:text-white text-lg leading-none">
          Mony
        </span>
      )}
    </span>
  )
}
