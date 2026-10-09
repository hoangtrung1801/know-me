import { useState, useEffect } from "react";
import { Terminal, Menu, X, ArrowRight, ExternalLink } from "lucide-react";
import { REPO_URL, INSTALL_COMMAND } from "../config/landing";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Dismiss mobile menu on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileMenuOpen]);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex justify-center px-4 pt-4 sm:pt-6 pointer-events-none">
      <nav
        aria-label="Primary"
        className={`pointer-events-auto flex items-center justify-between gap-6 px-5 py-2.5 rounded-full transition-all duration-300 max-w-4xl w-full apple-glass-pill border border-[var(--landing-border)] ${
          scrolled ? "shadow-lg shadow-slate-900/5 bg-white/95" : ""
        }`}
      >
        {/* Brand */}
        <a
          href="#"
          className="flex items-center gap-2.5 group cursor-pointer"
          aria-label="KnowMe Home"
        >
          <img
            src="/logo-48.png"
            alt="KnowMe logo"
            width={24}
            height={24}
            className="w-6 h-6 rounded-md object-contain"
          />
          <span className="font-bold text-sm tracking-tight text-[var(--landing-text)] group-hover:text-[var(--landing-primary)] transition-colors">
            KnowMe
          </span>
        </a>

        {/* Desktop Links */}
        <div className="hidden md:flex items-center gap-6 text-xs sm:text-sm font-medium text-[var(--landing-muted)]">
          <a
            href="#showcase"
            className="hover:text-[var(--landing-text)] transition-colors cursor-pointer"
          >
            Showcase
          </a>
          <a
            href="#features"
            className="hover:text-[var(--landing-text)] transition-colors cursor-pointer"
          >
            Features
          </a>
          <a
            href="#faq"
            className="hover:text-[var(--landing-text)] transition-colors cursor-pointer"
          >
            FAQ
          </a>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="hover:text-[var(--landing-text)] transition-colors inline-flex items-center gap-1 cursor-pointer"
          >
            <span>GitHub</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {/* CTA Action */}
        <div className="flex items-center gap-2">
          <a
            href="#get-started"
            className="hidden sm:inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold text-white bg-[var(--landing-primary)] hover:bg-[var(--landing-primary-hover)] transition-colors shadow-sm cursor-pointer"
          >
            <span>Get Started</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </a>

          {/* Mobile menu toggle */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-nav"
            aria-label="Toggle navigation menu"
            className="md:hidden flex items-center justify-center min-w-[44px] min-h-[44px] p-2 rounded-full text-[var(--landing-muted)] hover:text-[var(--landing-text)] transition-colors cursor-pointer"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </nav>

      {/* Mobile Menu Panel */}
      {mobileMenuOpen && (
        <div
          id="mobile-nav"
          className="pointer-events-auto absolute top-20 left-4 right-4 rounded-2xl bg-white border border-[var(--landing-border)] p-5 shadow-2xl flex flex-col gap-3 font-medium text-sm md:hidden"
        >
          <a
            href="#showcase"
            onClick={() => setMobileMenuOpen(false)}
            className="px-3 py-2 rounded-lg hover:bg-[var(--landing-surface-muted)] text-[var(--landing-text)]"
          >
            Showcase
          </a>
          <a
            href="#features"
            onClick={() => setMobileMenuOpen(false)}
            className="px-3 py-2 rounded-lg hover:bg-[var(--landing-surface-muted)] text-[var(--landing-text)]"
          >
            Features
          </a>
          <a
            href="#faq"
            onClick={() => setMobileMenuOpen(false)}
            className="px-3 py-2 rounded-lg hover:bg-[var(--landing-surface-muted)] text-[var(--landing-text)]"
          >
            FAQ
          </a>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            onClick={() => setMobileMenuOpen(false)}
            className="px-3 py-2 rounded-lg hover:bg-[var(--landing-surface-muted)] text-[var(--landing-text)] flex items-center justify-between"
          >
            <span>GitHub</span>
            <ExternalLink className="w-4 h-4 text-[var(--landing-muted)]" />
          </a>
          <a
            href="#get-started"
            onClick={() => setMobileMenuOpen(false)}
            className="mt-2 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-[var(--landing-primary)] hover:bg-[var(--landing-primary-hover)] transition-colors shadow-sm"
          >
            <span>Install KnowMe</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>
      )}
    </header>
  );
}
