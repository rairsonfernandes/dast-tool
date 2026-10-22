import { Link } from "react-router-dom";
import { ArrowRightIcon } from "@/components/LandingIcons";

export function CTA() {
  return (
    <section className="cta-premium">
      <div className="cta-premium-inner">
        <h2>
          Descobre as vulnerabilidades{" "}
          <span className="grad-text">antes que se tornem problemas.</span>
        </h2>
        <p>
          Automatiza os testes de segurança da tua aplicação e transforma
          resultados técnicos em ações concretas.
        </p>
        <div className="cta-premium-actions">
          <Link
            to="/register"
            className="btn-accent inline-flex items-center justify-center gap-2 px-7 py-4 rounded-full text-sm font-bold"
          >
            Começar a analisar
            <ArrowRightIcon size={16} />
          </Link>
          <a
            href="#demo"
            className="btn-ghost inline-flex items-center justify-center gap-2 px-7 py-4 rounded-full text-sm font-semibold"
          >
            Ver demonstração
          </a>
        </div>
        <div className="cta-premium-note">
          Testa apenas aplicações que tens autorização para analisar.
        </div>
      </div>
    </section>
  );
}