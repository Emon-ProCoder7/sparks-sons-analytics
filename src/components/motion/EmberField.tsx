"use client";

// Welding embers: glowing orange points drifting up and flickering out, drawn in WebGL (ogl).
// The brand is literally "Sparks" and the business is a fabrication workshop, so this is the
// one signature effect. It's cheap: a single draw call, paused when off-screen or when the tab
// is hidden, and replaced by nothing at all for people who prefer reduced motion.

import { useEffect, useRef } from "react";
import { Renderer, Program, Geometry, Mesh } from "ogl";
import { useReducedMotion } from "motion/react";

const vertex = /* glsl */ `
attribute vec4 seed;          // x: horizontal start, y: phase, z: speed, w: size
uniform float uTime;
uniform vec2 uRes;
uniform vec2 uMouse;          // -1..1, (0,0) when idle
uniform float uDpr;
varying float vLife;
varying float vHeat;

void main() {
  float life = fract(seed.y + uTime * seed.z);          // 0 = just born at the bottom, 1 = burnt out at the top
  float x = seed.x + sin(uTime * (0.6 + seed.z) + seed.y * 40.0) * 0.035 * (0.4 + life);
  float y = -1.1 + life * 2.3;
  // embers lean away from the cursor, like air moving over a hot bench
  vec2 d = vec2(x, y) - uMouse;
  x += 0.06 * d.x / (0.08 + dot(d, d)) * step(0.0001, abs(uMouse.x) + abs(uMouse.y));
  vLife = life;
  vHeat = seed.w;
  gl_Position = vec4(x, y, 0.0, 1.0);
  gl_PointSize = (4.0 + seed.w * 9.0) * uDpr * (1.0 - life * 0.65);
}`;

const fragment = /* glsl */ `
precision highp float;
uniform float uTime;
varying float vLife;
varying float vHeat;

void main() {
  vec2 p = gl_PointCoord - 0.5;
  float r = length(p);
  // bright pin-point core plus a soft halo, so each ember reads as light rather than a dot
  float core = smoothstep(0.22, 0.0, r) + 0.45 * smoothstep(0.5, 0.0, r);
  float flicker = 0.75 + 0.25 * sin(uTime * 18.0 + vHeat * 60.0);
  // white-hot core -> brand orange -> deep ember as it cools
  vec3 hot = vec3(1.0, 0.93, 0.75);
  vec3 orange = vec3(1.0, 0.47, 0.10);
  vec3 cool = vec3(0.75, 0.18, 0.04);
  vec3 col = mix(mix(hot, orange, smoothstep(0.0, 0.35, vLife)), cool, smoothstep(0.55, 1.0, vLife));
  float fade = smoothstep(0.0, 0.08, vLife) * (1.0 - smoothstep(0.65, 1.0, vLife));
  gl_FragColor = vec4(col, min(1.0, core) * fade * flicker);
}`;

export default function EmberField({ count = 140, className = "" }: { count?: number; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = host.current;
    if (!el || reduced) return;

    let renderer: Renderer;
    try {
      renderer = new Renderer({ alpha: true, premultipliedAlpha: false, dpr: Math.min(window.devicePixelRatio, 2) });
    } catch {
      return; // no WebGL: the hero simply stays static
    }
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none";
    el.appendChild(gl.canvas);

    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      // bias embers toward the right, where the workshop photo sits, leaving the title calm
      seeds.set([-0.2 + Math.pow(Math.random(), 0.6) * 1.3, Math.random(), 0.05 + Math.random() * 0.12, Math.random()], i * 4);
    }
    const geometry = new Geometry(gl, { seed: { size: 4, data: seeds } });
    const program = new Program(gl, {
      vertex,
      fragment,
      transparent: true,
      depthTest: false,
      uniforms: { uTime: { value: 0 }, uRes: { value: [1, 1] }, uMouse: { value: [0, 0] }, uDpr: { value: renderer.dpr } },
    });
    program.setBlendFunc(gl.SRC_ALPHA, gl.ONE); // additive glow
    const mesh = new Mesh(gl, { mode: gl.POINTS, geometry, program });

    const resize = () => {
      renderer.setSize(el.clientWidth, el.clientHeight);
      program.uniforms.uRes.value = [el.clientWidth, el.clientHeight];
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    const target = [0, 0];
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      target[0] = inside ? ((e.clientX - r.left) / r.width) * 2 - 1 : 0;
      target[1] = inside ? -(((e.clientY - r.top) / r.height) * 2 - 1) : 0;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    let visible = true;
    const io = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting));
    io.observe(el);

    let raf = 0;
    const start = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible || document.hidden) return;
      const m = program.uniforms.uMouse.value as number[];
      m[0] += (target[0] - m[0]) * 0.06;
      m[1] += (target[1] - m[1]) * 0.06;
      program.uniforms.uTime.value = (now - start) / 1000;
      renderer.render({ scene: mesh });
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      gl.canvas.remove();
    };
  }, [count, reduced]);

  return <div ref={host} aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} />;
}
