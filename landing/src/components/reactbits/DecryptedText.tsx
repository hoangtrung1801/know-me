import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";

interface DecryptedTextProps extends HTMLMotionProps<"span"> {
  text: string;
  speed?: number;
  maxIterations?: number;
  sequential?: boolean;
  revealDirection?: "start" | "end" | "center";
  useOriginalCharsOnly?: boolean;
  characters?: string;
  className?: string;
  encryptedClassName?: string;
  animateOn?: "view" | "hover" | "click";
}

export function DecryptedText({
  text,
  speed = 40,
  maxIterations = 8,
  sequential = true,
  revealDirection = "start",
  useOriginalCharsOnly = false,
  characters = "01_!<>{}[]/\\$@~-+=*%?",
  className = "",
  encryptedClassName = "text-[var(--accent)] opacity-80",
  animateOn = "hover",
  ...props
}: DecryptedTextProps) {
  const [displayText, setDisplayText] = useState<string>(text);
  const [isAnimating, setIsAnimating] = useState<boolean>(false);
  const [revealedIndices, setRevealedIndices] = useState<Set<number>>(new Set());
  const containerRef = useRef<HTMLSpanElement>(null);

  const availableChars = useMemo<string[]>(() => {
    return useOriginalCharsOnly
      ? Array.from(new Set(text.split(""))).filter((c) => c !== " ")
      : characters.split("");
  }, [useOriginalCharsOnly, text, characters]);

  const shuffleText = useCallback(
    (originalText: string, currentRevealed: Set<number>) => {
      return originalText
        .split("")
        .map((char, i) => {
          if (char === " ") return " ";
          if (currentRevealed.has(i)) return originalText[i];
          return availableChars[Math.floor(Math.random() * availableChars.length)];
        })
        .join("");
    },
    [availableChars]
  );

  const triggerDecrypt = useCallback(() => {
    setRevealedIndices(new Set());
    setIsAnimating(true);
  }, []);

  useEffect(() => {
    if (!isAnimating) return;
    const interval = setInterval(() => {
      setRevealedIndices((prev) => {
        if (prev.size < text.length) {
          const nextIndex = prev.size;
          const next = new Set(prev);
          next.add(nextIndex);
          setDisplayText(shuffleText(text, next));
          return next;
        } else {
          clearInterval(interval);
          setIsAnimating(false);
          setDisplayText(text);
          return prev;
        }
      });
    }, speed);
    return () => clearInterval(interval);
  }, [isAnimating, text, speed, shuffleText]);

  useEffect(() => {
    if (animateOn === "view") {
      triggerDecrypt();
    }
  }, [animateOn, triggerDecrypt]);

  return (
    <motion.span
      ref={containerRef}
      className={className}
      onMouseEnter={() => {
        if (animateOn === "hover" && !isAnimating) triggerDecrypt();
      }}
      {...props}
    >
      {displayText}
    </motion.span>
  );
}
