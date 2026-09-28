"use client";

// Scroll-driven storytelling for the "why we're not in Maps" page (GSAP ScrollTrigger).
// Markup opts in with data-story attributes, so the page itself stays a plain server component:
//   slide-l / slide-r  → slide in from the side
//   pillars            → container; its [data-pillar] children reveal one by one (pinned on desktop)
//   rank-list          → its <li>s build up in order
//   you-good / you-bad → Sparks' own row lights up green / red once the list has built
//   rise               → generic fade-and-rise
// Reduced motion: nothing moves, everything is simply visible.

import { useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

export default function ScrollStory({ children }: { children: React.ReactNode }) {
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(
        { motion: "(prefers-reduced-motion: no-preference)", desktop: "(min-width: 1024px)" },
        (ctx) => {
          const { motion, desktop } = ctx.conditions as { motion: boolean; desktop: boolean };
          if (!motion) return;
          const q = gsap.utils.selector(scope);

          q("[data-story='slide-l'], [data-story='slide-r']").forEach((el) => {
            gsap.from(el, {
              xPercent: el.dataset.story === "slide-l" ? -12 : 12,
              autoAlpha: 0,
              duration: 0.9,
              ease: "expo.out",
              scrollTrigger: { trigger: el, start: "top 85%" },
            });
          });

          q("[data-story='rise']").forEach((el) => {
            gsap.from(el, { y: 28, autoAlpha: 0, duration: 0.8, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 88%" } });
          });

          q("[data-story='pillars']").forEach((wrap) => {
            const pillars = wrap.querySelectorAll("[data-pillar]");
            const tl = gsap.timeline({
              scrollTrigger: desktop
                ? { trigger: wrap, start: "center center", end: "+=420", scrub: 0.6, pin: wrap.closest("section") ?? wrap, anticipatePin: 1 }
                : { trigger: wrap, start: "top 80%" },
            });
            tl.from(pillars, { y: 40, autoAlpha: 0, scale: 0.96, stagger: 0.5, duration: 0.6, ease: "power2.out" });
            // the primary-category pillar is the point of the whole page: give it the orange edge last
            tl.to(pillars[0], { boxShadow: "inset 4px 0 0 #ff781a", backgroundColor: "#fff1e6", duration: 0.4 }, ">");
          });

          q("[data-story='rank-list']").forEach((list) => {
            const items = list.querySelectorAll("li");
            const tl = gsap.timeline({ scrollTrigger: { trigger: list, start: "top 80%" } });
            tl.from(items, { x: -16, autoAlpha: 0, duration: 0.45, ease: "power2.out", stagger: 0.12 });
            const good = list.querySelector("[data-story='you-good']");
            const bad = list.querySelector("[data-story='you-bad']");
            if (good) tl.fromTo(good, { backgroundColor: "rgba(31,138,76,0)" }, { backgroundColor: "rgba(31,138,76,.12)", scale: 1.04, transformOrigin: "left center", duration: 0.5, ease: "back.out(2)" });
            if (bad) tl.fromTo(bad, { backgroundColor: "rgba(197,48,48,0)" }, { backgroundColor: "rgba(197,48,48,.10)", duration: 0.35, repeat: 1, yoyo: true, ease: "power1.inOut" }).to(bad, { backgroundColor: "rgba(197,48,48,.10)", duration: 0.3 });
          });
        },
      );
      return () => mm.revert();
    },
    { scope },
  );

  return <div ref={scope}>{children}</div>;
}
