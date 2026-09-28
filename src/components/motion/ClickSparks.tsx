"use client";

// Orange sparks burst from every button click — a nod to the name on the sign.
// Adapted from React Bits "ClickSpark" (reactbits.dev, MIT + Commons Clause, David Haz):
// changed to a single fixed overlay above all content (the original canvas sat underneath
// cards), listening only to button/link clicks, and drawing only while sparks are alive
// instead of running an animation loop forever.

import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";

type Spark = { x: number; y: number; angle: number; start: number; len: number };

const COLOR = "#ff781a";
const DURATION = 420;
const COUNT = 9;
const RADIUS = 22;

export default function ClickSparks() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || reduced) return;

    const dpr = Math.min(window.devicePixelRatio, 2);
    const size = () => {
      canvas.width = innerWidth * dpr;
      canvas.height = innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();
    window.addEventListener("resize", size);

    let sparks: Spark[] = [];
    let raf = 0;
    const ease = (t: number) => t * (2 - t);

    const draw = (now: number) => {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      sparks = sparks.filter((s) => now - s.start < DURATION);
      for (const s of sparks) {
        const t = ease((now - s.start) / DURATION);
        const d = t * RADIUS;
        const l = s.len * (1 - t);
        ctx.strokeStyle = COLOR;
        ctx.globalAlpha = 1 - t * 0.6;
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(s.x + d * Math.cos(s.angle), s.y + d * Math.sin(s.angle));
        ctx.lineTo(s.x + (d + l) * Math.cos(s.angle), s.y + (d + l) * Math.sin(s.angle));
        ctx.stroke();
      }
      raf = sparks.length ? requestAnimationFrame(draw) : 0;
    };

    const onClick = (e: MouseEvent) => {
      const hit = (e.target as HTMLElement | null)?.closest("button, a.btn, [data-spark]");
      if (!hit || (hit as HTMLButtonElement).disabled) return;
      const now = performance.now();
      for (let i = 0; i < COUNT; i++) {
        sparks.push({ x: e.clientX, y: e.clientY, angle: (Math.PI * 2 * i) / COUNT + Math.random() * 0.35, start: now, len: 8 + Math.random() * 6 });
      }
      if (!raf) raf = requestAnimationFrame(draw);
    };
    document.addEventListener("click", onClick, true);

    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("resize", size);
      cancelAnimationFrame(raf);
    };
  }, [reduced]);

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 z-[100] h-screen w-screen" />;
}
