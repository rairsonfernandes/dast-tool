import { useEffect, useState, ReactNode } from "react";
import { Link } from "react-router-dom";

interface TocItem {
  id: string;
  label: string;
}

interface LegalLayoutProps {
  title: string;
  subtitle: string;
  version: string;
  lastUpdated: string;
  effectiveDate: string;
  toc: TocItem[];
  children: ReactNode;
  breadcrumb?: string;
}

export function LegalLayout({
  title,
  subtitle,
  version,
  lastUpdated,
  effectiveDate,
  toc,
  children,
  breadcrumb = "Legal",
}: LegalLayoutProps) {
  const [activeId, setActiveId] = useState<string>("");
  const [mobileTocOpen, setMobileTocOpen] = useState(false);

  /* Active section highlighting */
  useEffect(() => {
    const headings = toc
      .map((t) => document.getElementById(t.id))
      .filter(Boolean) as HTMLElement[];

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      { rootMargin: "-100px 0px -70% 0px", threshold: 0 }
    );

    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, [toc]);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      const y = el.getBoundingClientRect().top + window.scrollY - 100;
      window.scrollTo({ top: y, behavior: "smooth" });
      setMobileTocOpen(false);
    }
  };

  return (
    <div className="legal-page">
      {/* Topbar simplificada */}
      <header className="legal-header">
        <div className="legal-header-inner">
          <Link to="/" className="legal-brand">
            SENT<span>I</span>NEL
          </Link>
          <div className="legal-header-nav">
            <Link to="/" className="legal-header-link">
              ← Voltar ao site
            </Link>
            <Link to="/privacy" className="legal-header-link">
              Privacidade
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="legal-hero">
        <div className="legal-hero-inner">
          <nav className="legal-breadcrumb" aria-label="Breadcrumb">
            <Link to="/">Início</Link>
            <span>/</span>
            <span>{breadcrumb}</span>
            <span>/</span>
            <span className="legal-breadcrumb-current">{title}</span>
          </nav>

          <h1 className="legal-title">{title}</h1>
          <p className="legal-subtitle">{subtitle}</p>

          <div className="legal-meta">
            <div className="legal-meta-item">
              <span className="legal-meta-label">Versão</span>
              <span className="legal-meta-value">{version}</span>
            </div>
            <div className="legal-meta-item">
              <span className="legal-meta-label">Última atualização</span>
              <span className="legal-meta-value">{lastUpdated}</span>
            </div>
            <div className="legal-meta-item">
              <span className="legal-meta-label">Em vigor desde</span>
              <span className="legal-meta-value">{effectiveDate}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Mobile TOC toggle */}
      <div className="legal-mobile-toc">
        <button
          type="button"
          className="legal-mobile-toc-btn"
          onClick={() => setMobileTocOpen((o) => !o)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
          Índice
        </button>
        {mobileTocOpen && (
          <ul className="legal-mobile-toc-list">
            {toc.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="legal-mobile-toc-link"
                  onClick={() => scrollTo(item.id)}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Conteúdo + TOC lateral */}
      <div className="legal-body">
        <aside className="legal-toc" aria-label="Índice">
          <p className="legal-toc-title">Índice</p>
          <ul>
            {toc.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`legal-toc-link ${activeId === item.id ? "active" : ""}`}
                  onClick={() => scrollTo(item.id)}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <article className="legal-content">{children}</article>
      </div>

      {/* Footer */}
      <footer className="legal-footer">
        <div className="legal-footer-inner">
          <p className="legal-footer-copy">
            © {new Date().getFullYear()} Sentinel. Todos os direitos reservados.
          </p>
          <nav className="legal-footer-nav">
            <Link to="/terms">Termos</Link>
            <Link to="/privacy">Privacidade</Link>
            <a href="mailto:legal@sentinel.sec">legal@sentinel.sec</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}