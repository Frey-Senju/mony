"use client";

import { usePathname } from "next/navigation";
import { useMemo, type CSSProperties } from "react";

type RouteCamera = {
  x: string;
  y: string;
  rot: string;
  scale: string;
  hue: string;
};

const ROUTE_CAMERAS: ReadonlyArray<{ match: (path: string) => boolean; camera: RouteCamera }> = [
  { match: (p) => p === "/" || p === "/dashboard", camera: { x: "0vw", y: "0vh", rot: "0deg", scale: "1", hue: "0deg" } },
  { match: (p) => p.startsWith("/dashboard/accounts"), camera: { x: "-6vw", y: "-4vh", rot: "8deg", scale: "1.05", hue: "8deg" } },
  { match: (p) => p.startsWith("/dashboard/reports"), camera: { x: "6vw", y: "-5.5vh", rot: "-9deg", scale: "1.05", hue: "-8deg" } },
  { match: (p) => p.startsWith("/dashboard/budgets"), camera: { x: "-5.5vw", y: "5vh", rot: "11deg", scale: "1.06", hue: "12deg" } },
  { match: (p) => p.startsWith("/dashboard/insights"), camera: { x: "6.5vw", y: "4.5vh", rot: "-11deg", scale: "1.07", hue: "-12deg" } },
  { match: (p) => p.startsWith("/dashboard/goals"), camera: { x: "-4.5vw", y: "-6vh", rot: "9deg", scale: "1.04", hue: "6deg" } },
  { match: (p) => p.startsWith("/settings/connections"), camera: { x: "5vw", y: "6vh", rot: "-8deg", scale: "1.05", hue: "-6deg" } },
  { match: (p) => p.startsWith("/settings/appearance"), camera: { x: "-6vw", y: "3vh", rot: "14deg", scale: "1.08", hue: "14deg" } },
  { match: (p) => p.startsWith("/auth"), camera: { x: "0vw", y: "-4vh", rot: "5deg", scale: "1.03", hue: "4deg" } },
];

function cameraForPath(pathname: string): RouteCamera {
  const found = ROUTE_CAMERAS.find((entry) => entry.match(pathname));
  if (found) return found.camera;
  return { x: "0vw", y: "0vh", rot: "0deg", scale: "1", hue: "0deg" };
}

/**
 * Persistent full-viewport Apple Liquid Glass ambient fluid backdrop (L0).
 * Respects prefers-reduced-motion, motion="off", and reduceTransparency.
 */
export function LiquidGlassBackdrop() {
  const pathname = usePathname() || "/";

  const cameraStyle = useMemo(() => {
    const cam = cameraForPath(pathname);
    return {
      "--route-x": cam.x,
      "--route-y": cam.y,
      "--route-rot": cam.rot,
      "--route-scale": cam.scale,
      "--route-hue": cam.hue,
    } as CSSProperties;
  }, [pathname]);

  return (
    <>
      <svg aria-hidden="true" className="pointer-events-none fixed h-0 w-0 overflow-hidden" focusable="false">
        <defs>
          <filter id="apple-liquid-refract" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.012 0.018" numOctaves="2" seed="7" result="noise" />
            <feGaussianBlur in="noise" stdDeviation="3" result="softNoise" />
            <feDisplacementMap in="SourceGraphic" in2="softNoise" scale="12" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>

      <div
        aria-hidden="true"
        data-route={pathname}
        className="apple-ambient-canvas"
        style={cameraStyle}
      >
        <div className="apple-ambient-stage">
          <div className="liquid-orb liquid-orb-1" />
          <div className="liquid-orb liquid-orb-2" />
          <div className="liquid-orb liquid-orb-3" />
          <div className="liquid-ribbon liquid-ribbon-1" />
          <div className="liquid-ribbon liquid-ribbon-2" />
          <div className="liquid-ribbon liquid-ribbon-3" />
        </div>
        <div key={pathname} className="liquid-route-sweep" />
      </div>
    </>
  );
}
