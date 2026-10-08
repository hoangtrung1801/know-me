import { Navbar } from "./components/Navbar";
import { Hero } from "./components/Hero";
import { AppleDuoShowcase } from "./components/AppleDuoShowcase";
import { Features } from "./components/Features";
import { FAQ } from "./components/FAQ";
import { Footer } from "./components/Footer";

export default function App() {
  return (
    <div className="min-h-screen bg-white text-[#202d31] selection:bg-[#176b60]/20 selection:text-[#176b60] relative font-sans">
      <Navbar />
      <main>
        <Hero />
        <AppleDuoShowcase />
        <Features />
        <FAQ />
      </main>
      <Footer />
    </div>
  );
}
