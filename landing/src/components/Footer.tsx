import { ArrowUpRight } from "lucide-react";
import { REPO_URL, DOCS_URL, MCP_GUIDE_URL, QUICK_START_URL } from "../config/landing";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="relative border-t border-[var(--landing-border)] bg-[var(--landing-surface)] pt-16 pb-12 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto space-y-12">
        {/* Main Footer Links */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 text-sm">
          {/* Brand */}
          <div className="space-y-3">
            <div className="flex items-center gap-2.5 font-bold tracking-tight text-[var(--landing-text)]">
              <img
                src="/logo-48.png"
                width={24}
                height={24}
                className="w-6 h-6 rounded-md object-contain"
              />
              <span className="text-[var(--landing-primary)]">KnowMe</span>
            </div>
            <p className="text-xs text-[var(--landing-muted)] leading-relaxed">
              The local-first memory layer for software engineering teams and AI coding agents.
            </p>
          </div>

          {/* Navigation */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-mono uppercase tracking-wider text-[var(--landing-muted)] font-semibold">
              Product
            </h4>
            <ul className="space-y-2 text-xs text-[var(--landing-muted)]">
              <li>
                <a href="#showcase" className="hover:text-[var(--landing-text)] transition-colors">
                  Interactive Showcase
                </a>
              </li>
              <li>
                <a href="#features" className="hover:text-[var(--landing-text)] transition-colors">
                  Features & Capabilities
                </a>
              </li>
              <li>
                <a href="#faq" className="hover:text-[var(--landing-text)] transition-colors">
                  Architecture FAQ
                </a>
              </li>
              <li>
                <a href="#get-started" className="hover:text-[var(--landing-text)] transition-colors">
                  Installation
                </a>
              </li>
            </ul>
          </div>

          {/* Documentation */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-mono uppercase tracking-wider text-[var(--landing-muted)] font-semibold">
              Documentation
            </h4>
            <ul className="space-y-2 text-xs text-[var(--landing-muted)]">
              <li>
                <a
                  href={QUICK_START_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-[var(--landing-text)] transition-colors inline-flex items-center gap-1"
                >
                  <span>Quick Start Guide</span>
                  <ArrowUpRight className="w-3 h-3" />
                </a>
              </li>
              <li>
                <a
                  href={MCP_GUIDE_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-[var(--landing-text)] transition-colors inline-flex items-center gap-1"
                >
                  <span>MCP Integration Guide</span>
                  <ArrowUpRight className="w-3 h-3" />
                </a>
              </li>
              <li>
                <a
                  href={DOCS_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-[var(--landing-text)] transition-colors inline-flex items-center gap-1"
                >
                  <span>Reference Docs</span>
                  <ArrowUpRight className="w-3 h-3" />
                </a>
              </li>
            </ul>
          </div>

          {/* Repository & Community */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-mono uppercase tracking-wider text-[var(--landing-muted)] font-semibold">
              Open Source
            </h4>
            <ul className="space-y-2 text-xs text-[var(--landing-muted)]">
              <li>
                <a
                  href={REPO_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-[var(--landing-text)] transition-colors inline-flex items-center gap-1"
                >
                  <span>GitHub Repository</span>
                  <ArrowUpRight className="w-3 h-3" />
                </a>
              </li>
              <li>
                <a
                  href="https://www.npmjs.com/package/@hoangtrung1801/knowme"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-[var(--landing-text)] transition-colors inline-flex items-center gap-1"
                >
                  <span>npm Package</span>
                  <ArrowUpRight className="w-3 h-3" />
                </a>
              </li>
              <li>
                <a
                  href={`${REPO_URL}/blob/main/LICENSE`}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-[var(--landing-text)] transition-colors inline-flex items-center gap-1"
                >
                  <span>MIT License</span>
                  <ArrowUpRight className="w-3 h-3" />
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Copyright */}
        <div className="pt-8 border-t border-[var(--landing-border)] flex flex-col sm:flex-row items-center justify-between text-xs text-[var(--landing-muted)] gap-4">
          <p>© {currentYear} KnowMe Project. Distributed under the MIT License.</p>
          <div className="flex items-center gap-1">
            <span>Built for humans and autonomous coding agents.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
