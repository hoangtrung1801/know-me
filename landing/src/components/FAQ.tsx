import { HelpCircle } from "lucide-react";
import { faqs, type FAQItem } from "../data/landingContent";

export function FAQ({ items = faqs }: { items?: readonly FAQItem[] }) {
  return (
    <section id="faq" className="relative py-20 sm:py-28 px-4 sm:px-6 max-w-4xl mx-auto space-y-12">
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[var(--landing-surface-muted)] border border-[var(--landing-border)] text-xs font-mono text-[var(--landing-primary)] font-medium">
          <HelpCircle className="w-3.5 h-3.5" />
          <span>SPECIFICATIONS & ARCHITECTURE</span>
        </div>
        <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-[var(--landing-text)] leading-tight">
          Frequently Answered
        </h2>
        <p className="text-base sm:text-lg text-[var(--landing-muted)]">
          Everything you need to know about local storage, MCP tooling, and project workflows.
        </p>
      </div>

      {/* Native details/summary FAQ */}
      <div className="space-y-4">
        {items.map((faq) => (
          <details
            key={faq.id}
            className="group rounded-2xl border border-[var(--landing-border)] bg-[var(--landing-surface)] p-5 transition-all open:border-[var(--landing-primary)] open:shadow-md"
          >
            <summary className="flex items-center justify-between font-bold text-base sm:text-lg text-[var(--landing-text)] cursor-pointer list-none select-none">
              <span>{faq.question}</span>
              <span className="ml-4 flex-shrink-0 text-[var(--landing-muted)] group-open:text-[var(--landing-primary)] transition-transform duration-200 group-open:rotate-45">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </span>
            </summary>
            <div className="mt-4 pt-4 border-t border-[var(--landing-border)] text-sm sm:text-base text-[var(--landing-muted)] leading-relaxed">
              {faq.answer}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
