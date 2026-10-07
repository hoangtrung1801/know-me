import type { MouseEvent } from "react";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  isDark: boolean;
  onToggle: (event: MouseEvent<HTMLButtonElement>) => void;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizes = { sm: "size-8", md: "size-9", lg: "size-11" };

export function ThemeToggle({
  isDark,
  onToggle,
  size = "md",
  className,
}: ThemeToggleProps) {
  const Icon = isDark ? Moon : Sun;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={onToggle}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        sizes[size],
        className
      )}
    >
      <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
}
