"use client";

// 3D "rank skyline" of a Maps grid scan (React Three Fiber + drei), in the spirit of
// GitHub Skyline: one column per grid point, taller = better rank. Loaded only when the
// 3D tab is open. No network assets (no HDRs, no remote fonts) so it can't fail to load.

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Html, OrbitControls, RoundedBox } from "@react-three/drei";
import { useReducedMotion } from "motion/react";
import { PlaneGeometry, type Group, type Mesh } from "three";
import type { GridPoint } from "@/lib/types";
import { rankColor } from "@/lib/rank";

const SPACING = 1.25;
const MAX_H = 3.2;

function heightFor(rank: number | null, depth: number) {
  return rank === null ? 0.12 : 0.35 + ((depth + 1 - rank) / depth) * MAX_H;
}

function Column({ x, z, rank, depth, delay, reduced }: { x: number; z: number; rank: number | null; depth: number; delay: number; reduced: boolean }) {
  const ref = useRef<Group>(null);
  const target = heightFor(rank, depth);
  const born = useRef<number | null>(null);

  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    born.current ??= clock.elapsedTime;
    const t = reduced ? 1 : Math.min(1, Math.max(0, (clock.elapsedTime - born.current - delay) / 0.9));
    const e = 1 - Math.pow(1 - t, 3); // ease-out cubic
    g.scale.y = Math.max(0.001, e);
  });

  return (
    <group position={[x, 0, z]}>
      <group ref={ref} scale={[1, reduced ? 1 : 0.001, 1]}>
        <RoundedBox args={[0.78, target, 0.78]} radius={0.06} smoothness={3} position={[0, target / 2, 0]} castShadow>
          <meshStandardMaterial color={rankColor(rank)} roughness={0.45} metalness={0.15} />
        </RoundedBox>
      </group>
      <Html position={[0, target + 0.35, 0]} center distanceFactor={6} zIndexRange={[10, 0]}>
        <span style={{ font: "600 12px Oswald, sans-serif", color: "#111", background: "rgba(255,255,255,.92)", padding: "1px 6px", borderRadius: 3, whiteSpace: "nowrap", pointerEvents: "none" }}>
          {rank === null ? `${depth}+` : `#${rank}`}
        </span>
      </Html>
    </group>
  );
}

/** Translucent green plane at the height a #3 rank reaches: columns below it aren't in the top 3. */
function TopThreeLine({ size, depth }: { size: number; depth: number }) {
  const y = heightFor(3, depth);
  return (
    <group position={[0, y, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[size, size]} />
        <meshBasicMaterial color="#1f8a4c" transparent opacity={0.13} depthWrite={false} side={2} />
      </mesh>
      <lineSegments rotation={[-Math.PI / 2, 0, 0]}>
        <edgesGeometry args={[new PlaneGeometry(size, size)]} />
        <lineBasicMaterial color="#1f8a4c" />
      </lineSegments>
      <Html position={[size / 2, 0, size / 2]} center zIndexRange={[10, 0]}>
        <span style={{ font: "600 11px Oswald, sans-serif", letterSpacing: ".06em", color: "#fff", background: "#1f8a4c", padding: "2px 6px", borderRadius: 3, whiteSpace: "nowrap", pointerEvents: "none" }}>
          TOP-3 LINE
        </span>
      </Html>
    </group>
  );
}

function BusinessMarker({ x, z, reduced }: { x: number; z: number; reduced: boolean }) {
  const ref = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current || reduced) return;
    ref.current.rotation.y = clock.elapsedTime * 0.9;
    ref.current.position.y = 4.4 + Math.sin(clock.elapsedTime * 1.6) * 0.12;
  });
  return (
    <mesh ref={ref} position={[x, 4.4, z]} castShadow>
      <octahedronGeometry args={[0.32, 0]} />
      <meshStandardMaterial color="#ff781a" emissive="#ff781a" emissiveIntensity={0.55} roughness={0.3} />
    </mesh>
  );
}

export default function GridSkyline({ points, depth, gridSize, spacingKm, center, business }: {
  points: GridPoint[];
  depth: number;
  gridSize: number;
  spacingKm: number;
  center: [number, number];
  business: [number, number];
}) {
  const reduced = !!useReducedMotion();
  // business position in grid units: km offset from the centre / grid spacing
  const kmPerLng = 111.32 * Math.cos((center[0] * Math.PI) / 180);
  const bx = (((business[1] - center[1]) * kmPerLng) / spacingKm) * SPACING;
  const bz = (((center[0] - business[0]) * 111.32) / spacingKm) * SPACING;

  // points arrive row-major, north → south, west → east (see worker/maps.py grid_points)
  const cols = useMemo(() => {
    const half = (gridSize - 1) / 2;
    return points.map((p, i) => {
      const r = Math.floor(i / gridSize);
      const c = i % gridSize;
      const dist = Math.hypot(r - half, c - half);
      return { ...p, x: (c - half) * SPACING, z: (r - half) * SPACING, delay: 0.15 + dist * 0.12 };
    });
  }, [points, gridSize]);

  const plate = gridSize * SPACING + 0.6;

  return (
    <div className="relative h-[460px] w-full overflow-hidden rounded-[6px] bg-[radial-gradient(120%_90%_at_50%_0%,#ffffff,#eceae6)]">
      <Canvas shadows dpr={[1, 2]} camera={{ position: [plate * 1.75, plate * 1.45, plate * 2.1], fov: 34 }}>
        <hemisphereLight args={["#ffffff", "#d9d4cc", 0.9]} />
        <directionalLight position={[5, 9, 4]} intensity={1.5} castShadow shadow-mapSize={[1024, 1024]} />
        <directionalLight position={[-6, 4, -3]} intensity={0.35} color="#ffd2ad" />
        <group position={[0, -1.2, 0]}>
          <RoundedBox args={[plate, 0.22, plate]} radius={0.08} position={[0, -0.11, 0]} receiveShadow>
            <meshStandardMaterial color="#2d2e32" roughness={0.8} />
          </RoundedBox>
          {cols.map((c, i) => (
            <Column key={i} x={c.x} z={c.z} rank={c.rank} depth={depth} delay={c.delay} reduced={reduced} />
          ))}
          <TopThreeLine size={plate} depth={depth} />
          <BusinessMarker x={bx} z={bz} reduced={reduced} />
          <ContactShadows position={[0, -0.23, 0]} opacity={0.35} scale={plate * 2} blur={2.4} far={4} />
        </group>
        <OrbitControls target={[0, 0.5, 0]} enablePan={false} enableZoom={false} autoRotate={!reduced} autoRotateSpeed={0.6} minPolarAngle={0.5} maxPolarAngle={1.25} />
      </Canvas>
      <p className="pointer-events-none absolute bottom-2 left-3 text-[0.7rem] text-muted">Drag to rotate · taller = higher on Google Maps · green plane = top-3 line · orange = you</p>
    </div>
  );
}
