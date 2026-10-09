import { useState } from "react";
import type { ProductSlide } from "../data/landingContent";

export interface ScreenshotGalleryProps {
  slides: readonly ProductSlide[];
}

export function ScreenshotGallery({ slides }: ScreenshotGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const activeSlide = slides[selectedIndex] || slides[0];

  return (
    <div className="space-y-6">
      {/* Gallery Selector Buttons */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {slides.map((slide, index) => {
          const isSelected = index === selectedIndex;
          return (
            <button
              key={slide.id}
              type="button"
              onClick={() => setSelectedIndex(index)}
              aria-pressed={isSelected}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all cursor-pointer ${
                isSelected
                  ? "bg-[var(--landing-primary)] text-white shadow-md shadow-[var(--landing-primary)]/20"
                  : "bg-[var(--landing-surface)] text-[var(--landing-muted)] hover:text-[var(--landing-text)] border border-[var(--landing-border)] hover:bg-[var(--landing-surface-muted)]"
              }`}
            >
              {slide.label}
            </button>
          );
        })}
      </div>

      {/* Screenshot Frame */}
      <div className="relative rounded-2xl sm:rounded-3xl border border-[var(--landing-border)] bg-[var(--landing-surface)] p-2 sm:p-4 shadow-xl overflow-hidden aspect-[16/10] max-w-5xl mx-auto">
        <img
          src={activeSlide.image}
          alt={`KnowMe screenshot: ${activeSlide.label}`}
          width={activeSlide.width}
          height={activeSlide.height}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover rounded-xl sm:rounded-2xl border border-[var(--landing-border)] bg-slate-900"
        />

        {/* Caption */}
        <div className="absolute bottom-4 left-4 right-4 sm:bottom-6 sm:left-6 sm:right-6 pointer-events-none">
          <div className="apple-glass px-4 py-2.5 rounded-xl border border-white/40 shadow-lg max-w-xl mx-auto text-center">
            <p className="text-xs sm:text-sm font-medium text-[var(--landing-text)]">
              {activeSlide.description}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
