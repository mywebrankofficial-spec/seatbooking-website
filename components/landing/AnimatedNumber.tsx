'use client';
/** Number that glides to its new value (spring), formatted on every frame without React re-renders. */
import { motion, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import { useEffect } from 'react';

interface AnimatedNumberProps {
  value: number;
  format: (v: number) => string;
  className?: string;
}

export function AnimatedNumber({ value, format, className }: AnimatedNumberProps) {
  const reduce = useReducedMotion();
  const spring = useSpring(value, { stiffness: 140, damping: 24, mass: 0.8 });
  const text = useTransform(spring, format);

  useEffect(() => {
    if (reduce) spring.jump(value);
    else spring.set(value);
  }, [value, reduce, spring]);

  return <motion.span className={className}>{text}</motion.span>;
}

export default AnimatedNumber;
