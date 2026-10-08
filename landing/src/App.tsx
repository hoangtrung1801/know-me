import { Navbar } from "./components/Navbar";
import { Hero } from "./components/Hero";
import { AppleDuoShowcase } from "./components/AppleDuoShowcase";
import { Features } from "./components/Features";
import { FAQ } from "./components/FAQ";
import { Footer } from "./components/Footer";

export default function App() {
  return (
    <div className="min-h-screen bg-black text-[#f5f5f7] selection:bg-white/20 selection:text-white relative font-sans">
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
