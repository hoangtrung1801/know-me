import React, { type ComponentPropsWithoutRef, type CSSProperties } from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "../../lib/utils";

export interface ShimmerLinkProps extends ComponentPropsWithoutRef<"a"> {
  shimmerColor?: string;
  shimmerSize?: string;
  borderRadius?: string;
  shimmerDuration?: string;
  background?: string;
  className?: string;
  children?: React.ReactNode;
}

export const ShimmerLink = React.forwardRef<HTMLAnchorElement, ShimmerLinkProps>(
  (
    {
      shimmerColor = "#ffffff",
      shimmerSize = "0.05em",
      shimmerDuration = "3s",
      borderRadius = "100px",
      background = "var(--landing-primary)",
      className,
      children,
      ...props
    },
    ref
  ) => {
    const shouldReduceMotion = useReducedMotion();

    return (
      <a
        style={
          {
            "--spread": "90deg",
            "--shimmer-color": shimmerColor,
            "--radius": borderRadius,
            "--speed": shimmerDuration,
            "--cut": shimmerSize,
            "--bg": background,
          } as CSSProperties
        }
        className={cn(
          "group relative z-0 inline-flex cursor-pointer items-center justify-center overflow-hidden [border-radius:var(--radius)] border border-white/10 px-6 py-3 whitespace-nowrap text-white font-medium [background:var(--bg)]",
          !shouldReduceMotion && "transform-gpu transition-transform duration-200 active:scale-95",
          className
        )}
        ref={ref}
        {...props}
      >
        {/* spark container */}
        {!shouldReduceMotion && (
          <div className="absolute inset-0 -z-30 overflow-visible blur-[2px] @container-[size]">
            <div className="animate-shimmer-slide absolute inset-0 aspect-square h-[100cqh] rounded-none [mask:none]">
              <div className="animate-spin-around absolute -inset-full w-auto rotate-0 [background:conic-gradient(from_calc(270deg-(var(--spread)*0.5)),transparent_0,var(--shimmer-color)_var(--spread),transparent_var(--spread))]" />
            </div>
          </div>
        )}
        {children}

        {/* Highlight */}
        <div
          className={cn(
            "absolute inset-0 size-full rounded-[inherit] px-4 py-1.5 text-sm font-medium shadow-[inset_0_-8px_10px_#ffffff1f]",
            !shouldReduceMotion && "transform-gpu transition-all duration-300 ease-in-out group-hover:shadow-[inset_0_-6px_10px_#ffffff3f] group-active:shadow-[inset_0_-10px_10px_#ffffff3f]"
          )}
        />

        {/* backdrop */}
        <div
          className="absolute inset-[var(--cut)] -z-20 rounded-[inherit] [background:var(--bg)]"
        />
      </a>
    );
  }
);

ShimmerLink.displayName = "ShimmerLink";
