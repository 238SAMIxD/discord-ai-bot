import { Commands } from "./components/Commands.tsx";
import { Faq } from "./components/Faq.tsx";
import { Features } from "./components/Features.tsx";
import { Footer } from "./components/Footer.tsx";
import { Hero } from "./components/Hero.tsx";
import { HowItWorks } from "./components/HowItWorks.tsx";
import { Nav } from "./components/Nav.tsx";
import { SelfHost } from "./components/SelfHost.tsx";

/** The whole landing page. */
export function App() {
  return (
    <>
      <a
        href="#main"
        className="sr-only rounded-lg bg-brand px-4 py-2 font-medium text-on-brand focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-60"
      >
        Skip to content
      </a>
      <Nav />
      <main id="main" tabIndex={-1} className="bg-grid outline-none">
        <Hero />
        <Features />
        <Commands />
        <HowItWorks />
        <SelfHost />
        <Faq />
      </main>
      <Footer />
    </>
  );
}
