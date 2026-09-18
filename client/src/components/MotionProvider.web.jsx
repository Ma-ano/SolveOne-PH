import { MotionConfig } from "motion/react";

export function MotionProvider({ children }) {
  return (
    <MotionConfig
      reducedMotion="user"
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </MotionConfig>
  );
}
