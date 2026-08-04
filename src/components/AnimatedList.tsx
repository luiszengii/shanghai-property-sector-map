"use client";

import { Children, isValidElement, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

const listVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.025,
      delayChildren: 0.04,
    },
  },
};

const itemVariants = {
  hidden: {
    opacity: 0,
    x: -10,
  },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.22,
      ease: [0.16, 1, 0.3, 1] as const,
    },
  },
};

export function AnimatedList({
  as = "div",
  children,
  className,
  ariaLabel,
  id,
  role,
}: {
  as?: "div" | "ul";
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
  id?: string;
  role?: string;
}) {
  const reduceMotion = useReducedMotion();
  const items = Children.toArray(children);
  const animationProps = {
    variants: reduceMotion ? undefined : listVariants,
    initial: reduceMotion ? false : "hidden",
    animate: "visible",
  } as const;

  if (as === "ul") {
    return (
      <motion.ul
        {...animationProps}
        className={className}
        aria-label={ariaLabel}
        id={id}
        role={role}
      >
        {items.map((child, index) => (
          <motion.li
            className="animated-list-item"
            key={isValidElement(child) && child.key !== null ? child.key : index}
            variants={reduceMotion ? undefined : itemVariants}
          >
            {child}
          </motion.li>
        ))}
      </motion.ul>
    );
  }

  return (
    <motion.div
      {...animationProps}
      className={className}
      aria-label={ariaLabel}
      id={id}
      role={role}
    >
      {items.map((child, index) => (
        <motion.div
          className="animated-list-item"
          key={isValidElement(child) && child.key !== null ? child.key : index}
          variants={reduceMotion ? undefined : itemVariants}
        >
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
}
