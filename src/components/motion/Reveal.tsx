import React from 'react';
import { motion, useReducedMotion } from 'motion/react';

interface RevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  duration?: number;
  once?: boolean;
}

/**
 * A restrained "gentle breeze" reveal: a short upward drift with a soft fade.
 * Motion is fully disabled when the visitor prefers reduced motion.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 22,
  duration = 0.9,
  once = true,
}: RevealProps) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: '-10% 0px -8% 0px' }}
      transition={{ duration, delay, ease: [0.16, 0.84, 0.24, 1] }}
    >
      {children}
    </motion.div>
  );
}

interface StaggerTextProps {
  children: React.ReactNode;
  className?: string;
  itemClassName?: string;
  delay?: number;
  step?: number;
}

/** Sequential editorial line reveals for headings and lede paragraphs. */
export function StaggerLines({
  children,
  className,
  itemClassName,
  delay = 0,
  step = 0.11,
}: StaggerTextProps) {
  const reduceMotion = useReducedMotion();
  const lines = React.Children.toArray(children);

  if (reduceMotion) {
    return (
      <div className={className}>
        {lines.map((child, index) => (
          <div key={index} className={itemClassName}>
            {child}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={className}>
      {lines.map((child, index) => (
        <motion.div
          key={index}
          className={itemClassName}
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-8% 0px -6% 0px' }}
          transition={{
            duration: 0.95,
            delay: delay + index * step,
            ease: [0.16, 0.84, 0.24, 1],
          }}
        >
          {child}
        </motion.div>
      ))}
    </div>
  );
}
