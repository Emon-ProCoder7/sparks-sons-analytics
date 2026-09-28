"use client";

// Lenis smooth scrolling driven by GSAP's ticker, so ScrollTrigger animations stay in lock-step.
// Skipped entirely for reduced-motion users (native scrolling is the accessible default).
// Inner scroll areas (tables, lists) opt out with data-lenis-prevent.

import { useEffect, useRef } from "react";
import { ReactLenis, type LenisRef } from "lenis/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useReducedMotion } from "motion/react";

gsap.registerPlugin(ScrollTrigger);

export default function SmoothScroll({ children }: { children: React.ReactNode }) {
  const lenisRef = useRef<LenisRef>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const update = (time: number) => lenisRef.current?.lenis?.raf(time * 1000);
    gsap.ticker.add(update);
    gsap.ticker.lagSmoothing(0);
    const lenis = lenisRef.current?.lenis;
    lenis?.on("scroll", ScrollTrigger.update);
    return () => {
      gsap.ticker.remove(update);
      lenis?.off("scroll", ScrollTrigger.update);
    };
  }, [reduced]);

  if (reduced) return <>{children}</>;
  return (
    <>
      <ReactLenis root ref={lenisRef} options={{ autoRaf: false, lerp: 0.11, wheelMultiplier: 0.95 }} />
      {children}
    </>
  );
}
