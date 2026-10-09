import { useEffect } from "react";
import { useAnimate, useReducedMotion } from "framer-motion";
import Lenis from "lenis";
import "lenis/dist/lenis.css";

export const easeOut = [0.23, 1, 0.32, 1] as const;

/** One-time editorial entrances, following Magic UI Blur Fade’s once-in-view pattern.
 * Reference: https://magicui.design/docs/components/blur-fade
 * Content stays readable before JS initializes; movement uses full transforms. */
export function useLandingMotion() {
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion || !scope.current) return;
    const controls: ReturnType<typeof animate>[] = [];
    const reveal = (element: Element, delay = 0, distance = 16) => {
      controls.push(
        animate(
          element,
          {
            opacity: [0, 1],
            transform: [`translateY(${distance}px)`, "translateY(0px)"],
          },
          { duration: 0.6, delay, ease: easeOut },
        ),
      );
    };
    scope.current
      .querySelectorAll(".hero > :not(h1)")
      .forEach((element, index) => {
        reveal(element, index * 0.06, 12);
      });
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const element = entry.target;
          // A short local stagger stays quick even on a long feature grid.
          const index = Number(element.getAttribute("data-reveal-index") ?? 0);
          const columns = window.matchMedia("(max-width: 760px)").matches
            ? 2
            : 3;
          if (document.documentElement.dataset.input !== "keyboard") {
            reveal(element, (index % columns) * 0.05);
          }
          observer.unobserve(element);
        }
      },
      { threshold: 0.12 },
    );
    scope.current
      .querySelectorAll(
        ".screenshot-stage, .section-heading, .feature, .memory-section > div, .get-started",
      )
      .forEach((element) => observer.observe(element));
    return () => {
      observer.disconnect();
      controls.forEach((control) => control.stop());
      // StrictMode, preference changes and remounts must not leave hidden content.
      scope.current
        ?.querySelectorAll<HTMLElement>(
          ".hero > :not(h1), .screenshot-stage, .section-heading, .feature, .memory-section > div, .get-started",
        )
        .forEach((element) => {
          element.style.removeProperty("opacity");
          element.style.removeProperty("transform");
        });
    };
  }, [animate, reduceMotion, scope]);

  return { scope, reduceMotion: !!reduceMotion };
}

/** Smooth wheel/anchor scrolling on desktop; touch and keyboard remain native. */
export function useLandingScroll() {
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = window.matchMedia("(pointer: fine)");
    let lenis: Lenis | undefined;
    const sync = () => {
      lenis?.destroy();
      lenis = undefined;
      if (!preference.matches && finePointer.matches) {
        lenis = new Lenis({
          autoRaf: true,
          lerp: 0.1,
          syncTouch: false,
          anchors: false,
        });
      }
    };
    const pointerInput = () => {
      document.documentElement.dataset.input = "pointer";
    };
    const keyboardInput = () => {
      document.documentElement.dataset.input = "keyboard";
      // Cancel pending wheel inertia before letting native keyboard scrolling run.
      if (lenis?.isScrolling === "smooth")
        lenis.scrollTo(window.scrollY, { immediate: true });
    };
    const anchorClick = (event: MouseEvent) => {
      if (
        !lenis ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link = (event.target as Element).closest<HTMLAnchorElement>(
        "a[href^='#']",
      );
      if (!link || link.target || link.hasAttribute("download")) return;
      const hash = link.getAttribute("href")!;
      const target =
        hash === "#" ? document.body : document.getElementById(hash.slice(1));
      if (!target) return;
      event.preventDefault();
      if (window.location.hash !== hash)
        window.history.pushState(null, "", hash);
      lenis.scrollTo(target, {
        // Lenis reads the existing scroll-padding and scroll-margin itself.
        offset: 0,
        duration: 0.8,
        immediate: event.detail === 0,
        onComplete: () => {
          if (target === document.body) return;
          const hadTabIndex = target.hasAttribute("tabindex");
          if (!hadTabIndex) target.setAttribute("tabindex", "-1");
          target.focus({ preventScroll: true });
          if (!hadTabIndex)
            target.addEventListener(
              "blur",
              () => target.removeAttribute("tabindex"),
              { once: true },
            );
        },
      });
    };
    sync();
    preference.addEventListener("change", sync);
    finePointer.addEventListener("change", sync);
    document.addEventListener("pointerdown", pointerInput, true);
    document.addEventListener("keydown", keyboardInput, true);
    document.addEventListener("click", anchorClick);
    return () => {
      lenis?.destroy();
      preference.removeEventListener("change", sync);
      finePointer.removeEventListener("change", sync);
      document.removeEventListener("pointerdown", pointerInput, true);
      document.removeEventListener("keydown", keyboardInput, true);
      document.removeEventListener("click", anchorClick);
      delete document.documentElement.dataset.input;
    };
  }, []);
}
