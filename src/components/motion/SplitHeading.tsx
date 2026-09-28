"use client";

// Page titles rise out of a mask line by line (GSAP SplitText, free since GSAP 3.13).
// Screen readers still get the plain heading text (SplitText's aria handling).

import { useRef } from "react";
import { gsap } from "gsap";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(SplitText, useGSAP);

export default function SplitHeading({ children, className = "" }: { children: string; className?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        SplitText.create(ref.current!, {
          type: "lines,words",
          mask: "lines",
          autoSplit: true,
          onSplit: (self) =>
            gsap.from(self.words, { yPercent: 110, duration: 0.9, ease: "expo.out", stagger: 0.045, delay: 0.1 }),
        });
      });
      return () => mm.revert();
    },
    { scope: ref },
  );

  return (
    <h1 ref={ref} className={className}>
      {children}
    </h1>
  );
}
