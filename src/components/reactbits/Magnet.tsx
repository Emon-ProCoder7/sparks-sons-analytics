'use client';
// Adapted from React Bits "Magnet" (reactbits.dev, MIT + Commons Clause, David Haz):
// writes the transform straight to the element instead of React state, so tracking the
// mouse doesn't re-render the button on every move. Does nothing for reduced-motion users.

import React, { useEffect, useRef, type ReactNode, type HTMLAttributes } from 'react';
import { useReducedMotion } from 'motion/react';

interface MagnetProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padding?: number;
  disabled?: boolean;
  magnetStrength?: number;
  wrapperClassName?: string;
  innerClassName?: string;
}

const Magnet: React.FC<MagnetProps> = ({ children, padding = 100, disabled = false, magnetStrength = 2, wrapperClassName = '', innerClassName = '', ...props }) => {
  const wrap = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    const reset = () => {
      el.style.transition = 'transform 0.5s ease-in-out';
      el.style.transform = 'translate3d(0,0,0)';
    };
    if (disabled || reduced) return reset();

    const onMove = (e: MouseEvent) => {
      const { left, top, width, height } = wrap.current!.getBoundingClientRect();
      const cx = left + width / 2;
      const cy = top + height / 2;
      if (Math.abs(cx - e.clientX) < width / 2 + padding && Math.abs(cy - e.clientY) < height / 2 + padding) {
        el.style.transition = 'transform 0.3s ease-out';
        el.style.transform = `translate3d(${(e.clientX - cx) / magnetStrength}px, ${(e.clientY - cy) / magnetStrength}px, 0)`;
      } else reset();
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, [padding, disabled, magnetStrength, reduced]);

  return (
    <div ref={wrap} className={wrapperClassName} style={{ position: 'relative', display: 'inline-block' }} {...props}>
      <div ref={inner} className={innerClassName} style={{ willChange: 'transform' }}>
        {children}
      </div>
    </div>
  );
};

export default Magnet;
