import { useEffect } from "react";
import { useAnimate, useReducedMotion } from "framer-motion";
import { easeOut } from "../../hooks/useLandingMotion";

/**
 * Adapted from Magic UI Text Animate's word segmentation and short stagger.
 * Reference retrieved through magicuidesign-mcp: getRegistryItem("text-animate").
 * https://magicui.design/docs/components/text-animate
 * Uses the project's Motion package, full transforms, visible defaults, and
 * reduced-motion handling rather than importing the registry's full preset set.
 */
export function TextAnimate({
  text,
  delay = 0,
}: {
  text: string;
  delay?: number;
}) {
  const [scope, animate] = useAnimate<HTMLSpanElement>();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion || !scope.current) return;
    const words = scope.current.querySelectorAll(".animated-word");
    const controls = [...words].map((word, index) =>
      animate(
        word,
        {
          opacity: [0, 1],
          transform: ["translateY(0.18em)", "translateY(0em)"],
        },
        { duration: 0.45, delay: delay + index * 0.05, ease: easeOut },
      ),
    );
    return () => {
      controls.forEach((control) => control.stop());
      words.forEach((word) => {
        (word as HTMLElement).style.removeProperty("opacity");
        (word as HTMLElement).style.removeProperty("transform");
      });
    };
  }, [animate, delay, reduceMotion, scope, text]);

  return (
    <span ref={scope} aria-hidden="true">
      {text.split(/(\s+)/).map((word, index) =>
        /^\s+$/.test(word) ? (
          word
        ) : (
          <span className="animated-word" key={`${word}-${index}`}>
            {word}
          </span>
        ),
      )}
    </span>
  );
}
