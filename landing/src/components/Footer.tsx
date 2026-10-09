import { motion } from "framer-motion";
import { Terminal, Github, Heart, Layers, ArrowUpRight } from "lucide-react";
import { ShimmerButton } from "./magicui/ShimmerButton";
import { Marquee } from "./magicui/Marquee";

export function Footer() {
  return (
    <footer className="relative border-t border-[#dbe4e2] bg-[#f4f7f7] pt-20 pb-12 px-6 overflow-hidden">
      {/* Subtle top glow with Know-Me teal */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-[1px] bg-gradient-to-r from-transparent via-[#176b60]/30 to-transparent" />

      <div className="max-w-7xl mx-auto space-y-16">
        {/* Supported ecosystem marquee ribbon */}
        <div className="space-y-3">
          <p className="text-center text-xs font-mono uppercase tracking-widest text-[#5c706f] font-semibold">
            Native Integration with Modern Coding Environments
          </p>
          <Marquee pauseOnHover className="[--duration:25s] py-3 border-y border-[#dbe4e2]">
            {[
              "Claude Desktop",
              "Cursor AI",
              "OpenCode",
              "OpenAI Codex",
              "Cline",
              "VS Code",
              "Neovim",
              "Terminal CLI",
              "Git Worktrees",
            ].map((tool) => (
              <span
                key={tool}
                className="mx-4 text-xs font-mono font-medium text-[#202d31] px-3 py-1.5 rounded-full bg-white border border-[#dbe4e2] shadow-xs"
              >
                {tool}
              </span>
            ))}
          </Marquee>
        </div>

        {/* Bottom Hero Callout */}
        <div className="apple-card rounded-3xl p-8 sm:p-14 text-center max-w-4xl mx-auto border border-[#dbe4e2] relative overflow-hidden bg-white shadow-md">
          <div className="absolute inset-0 bg-radial from-[#e0eeea]/60 via-transparent to-transparent pointer-events-none" />
          <div className="relative space-y-4">
            <h3 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] text-titanium">
              Ready to Upgrade Your Project Memory?
            </h3>
            <p className="text-base sm:text-lg text-[#5c706f] max-w-xl mx-auto font-medium">
              Start synchronizing your thought architecture and AI agents in fewer than 60 seconds.
            </p>
            <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
              <a
                href="https://github.com/hoangtrung1801/know-me"
                target="_blank"
                rel="noreferrer"
                className="w-full sm:w-auto inline-block"
              >
                <ShimmerButton
                  background="#176b60"
                  shimmerColor="#ffffff"
                  shimmerDuration="3s"
                  className="w-full sm:w-auto text-sm font-semibold shadow-md shadow-[#176b60]/20 flex items-center justify-center gap-2"
                >
                  <span>Get KnowMe on GitHub</span>
                  <ArrowUpRight className="w-4 h-4 ml-1" />
                </ShimmerButton>
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
            <div className="flex items-center gap-2.5 text-[#202d31] font-bold tracking-tight">
              <img src="/logo.png" alt="KnowMe" className="w-6 h-6 rounded-md object-contain" />
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
              <li><a href="#showcase" className="hover:text-[#176b60] transition-colors">Showcase</a></li>
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
              Designed adhering to Apple visual systems, WWDC fluid motion guidelines, and Know-Me's sovereign teal design tokens.
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
