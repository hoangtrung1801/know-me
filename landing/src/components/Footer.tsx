import { motion } from "framer-motion";
import { Terminal, Github, Heart, Layers, ArrowUpRight } from "lucide-react";

export function Footer() {
  return (
    <footer className="relative border-t border-[#dbe4e2] bg-[#f4f7f7] pt-20 pb-12 px-6 overflow-hidden">
      {/* Subtle top glow with Know-Me teal */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-[1px] bg-gradient-to-r from-transparent via-[#176b60]/30 to-transparent" />

      <div className="max-w-7xl mx-auto space-y-16">
        {/* Bottom Hero Callout */}
        <div className="apple-card rounded-3xl p-8 sm:p-14 text-center max-w-4xl mx-auto border border-[#dbe4e2] relative overflow-hidden bg-white shadow-md">
          <div className="absolute inset-0 bg-radial from-[#e0eeea]/60 via-transparent to-transparent pointer-events-none" />
          <div className="relative space-y-4">
            <h3 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] text-titanium">
              Ready for the Duo Era?
            </h3>
            <p className="text-base sm:text-lg text-[#5c706f] max-w-xl mx-auto font-medium">
              Start synchronizing your thought architecture and AI agents in fewer than 60 seconds.
            </p>
            <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
              <a
                href="https://github.com/hoangtrung1801/know-me"
                target="_blank"
                rel="noreferrer"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3 rounded-full text-sm font-semibold text-white bg-[#176b60] hover:bg-[#11534b] transition-all duration-150 active:scale-95 shadow-md shadow-[#176b60]/20"
              >
                <span>Get KnowMe on GitHub</span>
                <ArrowUpRight className="w-4 h-4" />
              </a>
              <div className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-[#f4f7f7] border border-[#dbe4e2] font-mono text-xs text-[#202d31]">
                <span className="text-[#176b60] font-bold">$</span>
                <span>knowme init</span>
              </div>
            </div>
          </div>
        </div>

        {/* Links Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-sm pt-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[#202d31] font-bold tracking-tight">
              <div className="w-5 h-5 rounded bg-[#176b60] text-white text-xs font-black flex items-center justify-center">
                K
              </div>
              <span className="text-[#176b60]">KnowMe</span>
            </div>
            <p className="text-xs text-[#5c706f] leading-relaxed">
              The local-first memory layer for software engineering teams and AI coding agents.
            </p>
          </div>

          <div className="space-y-2.5">
            <h4 className="text-xs font-mono uppercase tracking-wider text-[#5c706f] font-semibold">
              Ecosystem
            </h4>
            <ul className="space-y-2 text-xs text-[#5c706f]">
              <li><a href="#duo" className="hover:text-[#176b60] transition-colors">Duo Showcase</a></li>
              <li><a href="#features" className="hover:text-[#176b60] transition-colors">Visual Kanban</a></li>
              <li><a href="#features" className="hover:text-[#176b60] transition-colors">MCP Protocol Stdio</a></li>
              <li><a href="#features" className="hover:text-[#176b60] transition-colors">Knowledge Graphs</a></li>
            </ul>
          </div>

          <div className="space-y-2.5">
            <h4 className="text-xs font-mono uppercase tracking-wider text-[#5c706f] font-semibold">
              Resources
            </h4>
            <ul className="space-y-2 text-xs text-[#5c706f]">
              <li>
                <a href="https://github.com/hoangtrung1801/know-me" target="_blank" rel="noreferrer" className="hover:text-[#176b60] transition-colors flex items-center gap-1">
                  <span>GitHub Repository</span>
                  <ArrowUpRight className="w-3 h-3 text-[#5c706f]" />
                </a>
              </li>
              <li>
                <a href="https://www.npmjs.com/package/@hoangtrung1801/knowme" target="_blank" rel="noreferrer" className="hover:text-[#176b60] transition-colors flex items-center gap-1">
                  <span>npm Package</span>
                  <ArrowUpRight className="w-3 h-3 text-[#5c706f]" />
                </a>
              </li>
              <li><a href="#faq" className="hover:text-[#176b60] transition-colors">Architecture FAQ</a></li>
              <li><a href="https://github.com/hoangtrung1801/know-me/blob/main/LICENSE" target="_blank" rel="noreferrer" className="hover:text-[#176b60] transition-colors">MIT License</a></li>
            </ul>
          </div>

          <div className="space-y-2.5">
            <h4 className="text-xs font-mono uppercase tracking-wider text-[#5c706f] font-semibold">
              Design Heritage
            </h4>
            <p className="text-xs text-[#5c706f] leading-relaxed">
              Designed adhering to the Apple iPhone Duo visual system, WWDC fluid motion guidelines, and Know-Me's sovereign teal design tokens.
            </p>
          </div>
        </div>

        {/* Copyright */}
        <div className="pt-8 border-t border-[#dbe4e2] flex flex-col sm:flex-row items-center justify-between text-xs text-[#5c706f] gap-4">
          <p>© 2026 KnowMe Project. Distributed under the MIT License.</p>
          <div className="flex items-center gap-1 text-[#5c706f]">
            <span>Crafted with</span>
            <span className="text-[#176b60] font-semibold">Deep Teal Precision</span>
            <span>for Humans & Agents</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
