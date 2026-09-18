import { motion } from "motion/react";

export function PageTransition({ children }) {
  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      initial={{ opacity: 0.96, y: 8 }}
      style={{
        display: "flex",
        flex: 1,
        flexDirection: "column",
        minWidth: 0,
        width: "100%",
      }}
    >
      {children}
    </motion.div>
  );
}
