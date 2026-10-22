import { Navbar } from '@/components/landing/Navbar';
import { Hero } from '@/components/landing/Hero';
import { Features } from '@/components/landing/Features';
import { Capabilities } from '@/components/landing/Capabilities';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { TerminalDemo } from '@/components/landing/TerminalDemo';
import { Pricing } from '@/components/landing/Pricing';
import { Transparency } from '@/components/landing/Transparency';
import { FAQ } from '@/components/landing/FAQ';
import { CTA } from '@/components/landing/CTA';
import { Footer } from '@/components/landing/Footer';
import { BackToTop } from '@/components/landing/BackToTop';
import { usePageMeta } from '@/lib/usePageMeta';

const Landing = () => {
  usePageMeta();

  return (
    <div className="landing-root">
      <a href="#main-content" className="skip-link">Saltar para o conteúdo</a>
      <Navbar />
      <main id="main-content">
        <Hero />
        <Features />
        <Capabilities />
        <HowItWorks />
        <TerminalDemo />
        <Pricing />
        <Transparency />
        <FAQ />
        <CTA />
      </main>
      <Footer />
      <BackToTop />
    </div>
  );
};

export default Landing;