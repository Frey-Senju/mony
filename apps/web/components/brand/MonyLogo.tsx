'use client'

import React, { useId } from 'react'

export interface MonyLogoProps {
  size?: 'sm' | 'md' | 'lg'
  showWordmark?: boolean
  className?: string
}

const DIMENSIONS = {
  sm: 36,
  md: 42,
  lg: 54,
}

/**
 * Animated Apple Liquid Glass "M" Monogram with transparent floating glass coins.
 * Inspired by crystal refractive outline glass + floating translucent coins stream.
 */
export function MonyLogo({ size = 'md', showWordmark = true, className = '' }: MonyLogoProps) {
  const uid = useId().replace(/:/g, '')
  const dim = DIMENSIONS[size]

  return (
    <span className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      <span
        className="mony-logo-orb relative inline-flex items-center justify-center shrink-0 rounded-2xl overflow-hidden"
        style={{ width: dim, height: dim }}
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 64 64"
          width={dim}
          height={dim}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full"
        >
          <defs>
            {/* Outer crystal glass stroke gradient */}
            <linearGradient id={`glassEdge-${uid}`} x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.96" />
              <stop offset="32%" stopColor="#BAE6FD" stopOpacity="0.82" />
              <stop offset="65%" stopColor="#A5B4FC" stopOpacity="0.78" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.95" />
            </linearGradient>

            {/* Inner translucent liquid core */}
            <linearGradient id={`glassCore-${uid}`} x1="12" y1="10" x2="52" y2="54" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.46" />
              <stop offset="50%" stopColor="#38BDF8" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.32" />
            </linearGradient>

            {/* Transparent glass coin radial gradient */}
            <radialGradient id={`coinGlass-${uid}`} cx="32%" cy="28%" r="72%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
              <stop offset="42%" stopColor="#E0F2FE" stopOpacity="0.42" />
              <stop offset="78%" stopColor="#93C5FD" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.65" />
            </radialGradient>

            {/* Travelling caustic shimmer */}
            <linearGradient id={`causticSheen-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0" />
              <stop offset="45%" stopColor="#FFFFFF" stopOpacity="0.88" />
              <stop offset="55%" stopColor="#7DD3FC" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
            </linearGradient>

            <filter id={`glassGlow-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="2.2" floodColor="#0F172A" floodOpacity="0.22" />
            </filter>
          </defs>

          {/* Subtle frosted ambient backing */}
          <rect
            x="2"
            y="2"
            width="60"
            height="60"
            rx="16"
            fill="url(#glassCore-bg)"
            className="mony-logo-backdrop"
          />

          {/* Floating transparent glass coins stream (instead of water wave) */}
          <g className="mony-coin-float-a">
            <circle cx="14" cy="40" r="6.2" fill={`url(#coinGlass-${uid})`} stroke="rgba(255,255,255,0.85)" strokeWidth="1" />
            <circle cx="14" cy="40" r="3.9" stroke="rgba(255,255,255,0.45)" strokeWidth="0.6" strokeDasharray="1.8 1.4" />
            <path d="M11.6 37.4 A3.8 3.8 0 0 1 15.8 36.6" stroke="#FFFFFF" strokeWidth="0.9" strokeLinecap="round" opacity="0.9" />
          </g>

          <g className="mony-coin-float-b">
            <circle cx="49" cy="24" r="7.2" fill={`url(#coinGlass-${uid})`} stroke="rgba(255,255,255,0.9)" strokeWidth="1.05" />
            <circle cx="49" cy="24" r="4.6" stroke="rgba(255,255,255,0.45)" strokeWidth="0.65" />
            <path d="M46.2 21 A4.5 4.5 0 0 1 51.2 20.1" stroke="#FFFFFF" strokeWidth="1" strokeLinecap="round" opacity="0.92" />
          </g>

          <g className="mony-coin-float-c">
            <circle cx="33" cy="48" r="5" fill={`url(#coinGlass-${uid})`} stroke="rgba(255,255,255,0.82)" strokeWidth="0.9" />
            <circle cx="33" cy="48" r="2.9" stroke="rgba(255,255,255,0.4)" strokeWidth="0.55" />
          </g>

          <g className="mony-coin-float-d">
            <circle cx="24" cy="15" r="4.2" fill={`url(#coinGlass-${uid})`} stroke="rgba(255,255,255,0.78)" strokeWidth="0.85" />
          </g>

          {/* Sculpted hollow Liquid Glass "M" Monogram */}
          <g filter={`url(#glassGlow-${uid})`}>
            {/* Translucent thick glass tube body */}
            <path
              d="M15 49 V19 C15 16.6 17.8 15.4 19.6 17.1 L32 29.8 L44.4 17.1 C46.2 15.4 49 16.6 49 19 V49"
              stroke={`url(#glassCore-${uid})`}
              strokeWidth="8.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Crisp double crystal outer rim */}
            <path
              d="M15 49 V19 C15 16.6 17.8 15.4 19.6 17.1 L32 29.8 L44.4 17.1 C46.2 15.4 49 16.6 49 19 V49"
              stroke={`url(#glassEdge-${uid})`}
              strokeWidth="4.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Hollow crystal interior highlight (gives the iconic hollow glass-tube look from the reference) */}
            <path
              d="M15 49 V19 C15 16.6 17.8 15.4 19.6 17.1 L32 29.8 L44.4 17.1 C46.2 15.4 49 16.6 49 19 V49"
              stroke="rgba(15, 23, 42, 0.24)"
              strokeWidth="2.1"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mony-logo-inner-channel"
            />
            {/* Animated travelling specular glint along the M */}
            <path
              d="M15 49 V19 C15 16.6 17.8 15.4 19.6 17.1 L32 29.8 L44.4 17.1 C46.2 15.4 49 16.6 49 19 V49"
              stroke={`url(#causticSheen-${uid})`}
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mony-logo-glint"
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
