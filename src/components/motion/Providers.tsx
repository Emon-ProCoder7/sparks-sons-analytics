"use client";

import { MotionConfig } from "motion/react";
import SmoothScroll from "./SmoothScroll";
import ClickSparks from "./ClickSparks";

/** App-wide motion: honours the OS "reduce motion" setting, smooth scroll, click sparks. */
export default function MotionProviders({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <SmoothScroll>{children}</SmoothScroll>
      <ClickSparks />
    </MotionConfig>
  );
}
