import { motion } from "motion/react";

export function StickyHeader({ children, hidden }) {
  return (
    <motion.div
      animate={{ y: hidden ? "-105%" : "0%" }}
      initial={false}
      style={{
        backgroundColor: "rgba(247, 244, 236, 0.97)",
        backdropFilter: "blur(14px)",
        position: "sticky",
        top: 0,
        zIndex: 1000,
      }}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
