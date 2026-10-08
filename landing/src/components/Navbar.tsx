import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Terminal, 
  ArrowRight, 
  Menu, 
  X,
  ExternalLink
} from "lucide-react";

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

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex justify-center px-4 pt-4 sm:pt-6 pointer-events-none">
      <motion.nav 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", bounce: 0, duration: 0.6 }}
        className={`pointer-events-auto flex items-center justify-between gap-6 px-5 py-2.5 rounded-full transition-all duration-300 max-w-4xl w-full apple-glass-pill ${
          scrolled ? "shadow-xl shadow-zinc-900/5 border-[#176b60]/20" : ""
        }`}
      >
        {/* Brand */}
        <a 
          href="#" 
          className="flex items-center gap-2.5 text-[#202d31] font-medium tracking-tight group active:scale-95 transition-transform duration-100"
        >
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#176b60] via-[#238c7e] to-[#8ed6be] flex items-center justify-center p-[1px] shadow-sm">
            <div className="w-full h-full bg-[#176b60] rounded-[7px] flex items-center justify-center">
              <span className="text-xs font-black tracking-tighter text-white">KM</span>
            </div>
          </div>
          <span className="text-sm font-semibold tracking-tight text-[#202d31] group-hover:text-[#176b60] transition-colors">
            KnowMe
          </span>
          <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full bg-[#e0eeea] text-[#176b60] border border-[#176b60]/20 hidden sm:inline-block">
            Memory Layer
          </span>
        </a>

        {/* Desktop Links */}
        <div className="hidden md:flex items-center gap-6 text-[13px] font-medium text-[#5c706f]">
          <a href="#showcase" className="hover:text-[#176b60] transition-colors duration-150">
            Showcase
          </a>
          <a href="#features" className="hover:text-[#176b60] transition-colors duration-150">
            Capabilities
          </a>
          <a href="#faq" className="hover:text-[#176b60] transition-colors duration-150">
            FAQ
          </a>
        </div>

        {/* CTA Actions */}
        <div className="flex items-center gap-2">
          <a
            href="https://github.com/hoangtrung1801/know-me"
            target="_blank"
            rel="noreferrer"
            className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium text-[#202d31] hover:text-[#176b60] bg-[#f4f7f7] hover:bg-[#eaf0ef] border border-[#dbe4e2] transition-all duration-150 active:scale-95"
          >
            <Terminal className="w-3.5 h-3.5 text-[#176b60]" />
            <span>GitHub</span>
          </a>

          <a
            href="#showcase"
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold text-white bg-[#176b60] hover:bg-[#11534b] transition-all duration-150 shadow-sm active:scale-95"
          >
            <span>Experience KnowMe</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </a>

          {/* Mobile hamburger */}
          <button 
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-1.5 text-[#5c706f] hover:text-[#202d31] rounded-full bg-[#f4f7f7] border border-[#dbe4e2] active:scale-95"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="w-4 h-4 text-[#176b60]" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </motion.nav>

      {/* Mobile Menu Dropdown */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
            className="pointer-events-auto absolute top-20 inset-x-4 max-w-sm mx-auto apple-glass rounded-2xl p-4 flex flex-col gap-3 md:hidden shadow-xl border border-[#dbe4e2]"
          >
            <a 
              href="#showcase" 
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 text-sm font-medium text-[#202d31] hover:text-[#176b60] rounded-lg hover:bg-[#e0eeea]/50"
            >
              Showcase
            </a>
            <a 
              href="#features" 
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 text-sm font-medium text-[#202d31] hover:text-[#176b60] rounded-lg hover:bg-[#e0eeea]/50"
            >
              Capabilities
            </a>
            <a 
              href="#faq" 
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 text-sm font-medium text-[#202d31] hover:text-[#176b60] rounded-lg hover:bg-[#e0eeea]/50"
            >
              FAQ
            </a>
            <div className="pt-2 border-t border-[#dbe4e2] flex flex-col gap-2">
              <a
                href="https://github.com/hoangtrung1801/know-me"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold text-[#202d31] bg-[#f4f7f7] border border-[#dbe4e2]"
              >
                <Terminal className="w-3.5 h-3.5 text-[#176b60]" />
                <span>GitHub Repository</span>
                <ExternalLink className="w-3 h-3 text-[#5c706f]" />
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
