'use client';

// Adapted from React Bits "SpotlightCard" (reactbits.dev, MIT + Commons Clause, David Haz):
// restyled for the light workshop cards, and the pointer position is written to CSS variables
// instead of React state so moving the mouse doesn't re-render the card's contents.

import React, { useRef } from 'react';

interface SpotlightCardProps extends React.PropsWithChildren {
  className?: string;
  spotlightColor?: string;
}

const SpotlightCard: React.FC<SpotlightCardProps> = ({ children, className = '', spotlightColor = 'rgba(255, 120, 26, 0.14)' }) => {
  const divRef = useRef<HTMLDivElement>(null);

  const setVar = (k: string, v: string) => divRef.current?.style.setProperty(k, v);

  const handleMouseMove: React.MouseEventHandler<HTMLDivElement> = (e) => {
    const rect = divRef.current!.getBoundingClientRect();
    setVar('--sx', `${e.clientX - rect.left}px`);
    setVar('--sy', `${e.clientY - rect.top}px`);
  };

  return (
    <div
      ref={divRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setVar('--so', '1')}
      onMouseLeave={() => setVar('--so', '0')}
      onFocus={() => setVar('--so', '1')}
      onBlur={() => setVar('--so', '0')}
      className={`group relative overflow-hidden ${className}`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-500 ease-out"
        style={{ opacity: 'var(--so, 0)', background: `radial-gradient(260px circle at var(--sx, 50%) var(--sy, 50%), ${spotlightColor}, transparent 75%)` }}
      />
      {children}
    </div>
  );
};

export default SpotlightCard;
