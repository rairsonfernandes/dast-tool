import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ShieldIcon } from "@/components/LandingIcons";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`site-header ${scrolled ? "scrolled" : "at-top"}`}>
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="flex items-center justify-between h-[var(--header-height)]">
          {/* Logo + nome */}
          <Link to="/" className="brand">
            <span className="brand-name">
              SENT<span>I</span>NEL
            </span>
          </Link>

          {/* Ações — SÓ Entrar + Criar conta */}
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="hidden sm:inline-flex btn-ghost px-5 py-2.5 rounded-full text-sm font-semibold"
            >
              Entrar
            </Link>
            <Link
              to="/register"
              className="btn-accent px-5 py-2.5 rounded-full text-sm font-bold inline-flex items-center gap-2"
            >
              Criar conta
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}