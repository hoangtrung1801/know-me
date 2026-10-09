import { ArrowUpRight } from "lucide-react";
import { features, type FeatureItem } from "../data/landingContent";

export function Features({ items = features }: { items?: readonly FeatureItem[] }) {
  return (
    <section id="features" className="relative py-20 sm:py-28 px-4 sm:px-6 max-w-7xl mx-auto space-y-16">
      {/* Section Header */}
      <div className="text-center max-w-3xl mx-auto space-y-4">
        <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-[var(--landing-text)] leading-tight">
          One Memory. Zero Lock-in.
        </h2>
        <p className="text-base sm:text-lg text-[var(--landing-muted)]">
          Architected for developers who care about local ownership, git workflows, and giving AI agents deterministic context.
        </p>
      </div>

      {/* Six Features Grid: 1 col < 640px, 2 col 640-1023px, 3 col >= 1024px */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {items.map((feature) => {
          const Icon = feature.icon;
          return (
            <div
              key={feature.id}
              className="group relative p-6 rounded-2xl bg-[var(--landing-surface)] border border-[var(--landing-border)] hover:border-[var(--landing-primary)] transition-all shadow-xs hover:shadow-md flex flex-col justify-between"
            >
              <div className="space-y-4">
                <div className="w-10 h-10 rounded-xl bg-[var(--landing-surface-muted)] group-hover:bg-[var(--landing-primary-soft)] border border-[var(--landing-border)] flex items-center justify-center transition-colors">
                  <Icon className="w-5 h-5 text-[var(--landing-primary)]" />
                </div>

                <div className="space-y-2">
                  <h3 className="text-lg font-bold text-[var(--landing-text)]">
                    {feature.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-[var(--landing-muted)] leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </div>

              {feature.href && (
                <div className="pt-4 mt-2 border-t border-[var(--landing-border)]">
                  <a
                    href={feature.href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--landing-primary)] hover:text-[var(--landing-primary-hover)] transition-colors cursor-pointer"
                  >
                    <span>Read documentation</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
