import { Navbar } from "./components/Navbar";
import { Hero } from "./components/Hero";
import { AppleDuoShowcase } from "./components/AppleDuoShowcase";
import { Features } from "./components/Features";
import { FAQ } from "./components/FAQ";
import { InstallCTA } from "./components/InstallCTA";
import { Footer } from "./components/Footer";
import { useLandingScroll } from "./hooks/useLandingMotion";

export default function App() {
  useLandingScroll();

  return (
    <div className="min-h-screen flex flex-col bg-[var(--landing-bg)] text-[var(--landing-text)] selection:bg-[var(--landing-primary-soft)] selection:text-[var(--landing-primary-hover)]">
      {/* Skip to main content accessibility link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-[var(--landing-primary)] focus:text-white focus:rounded-lg focus:shadow-lg focus:outline-none"
      >
        Skip to main content
      </a>

      <Navbar />

      <main id="main-content" className="flex-1">
        <Hero />
        <AppleDuoShowcase />
        <Features />
        <FAQ />
        <InstallCTA />
      </main>

      <Footer />
    </div>
  );
}
