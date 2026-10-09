import type { Transition } from "framer-motion";

export const easeOutQuad = [0.23, 1, 0.32, 1] as const;

export const uiSpring: Transition = {
  type: "spring",
  stiffness: 320,
  damping: 36,
  mass: 1,
};

export const gentleSpring: Transition = {
  type: "spring",
  stiffness: 260,
  damping: 28,
  mass: 1,
};

export const revealTransition = {
  duration: 0.45,
  ease: easeOutQuad,
};
