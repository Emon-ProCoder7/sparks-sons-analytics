"use client";

// A template re-mounts on every navigation, so each page gets a soft fade-and-rise entrance.
import { motion } from "motion/react";

export default function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  );
}
