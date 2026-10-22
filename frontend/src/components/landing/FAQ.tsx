import { useState } from "react";

const FAQS = [
  {
    q: "O que é o Sentinel?",
    a: "É uma ferramenta open-source de Dynamic Application Security Testing (DAST). Corre 13 módulos de deteção contra uma aplicação web, à procura de vulnerabilidades OWASP Top 10.",
  },
  {
    q: "Preciso de criar conta para usar?",
    a: "Não se correres localmente — o CLI funciona sem autenticação. A conta é necessária apenas para a versão hosted (dashboard com histórico e relatórios).",
  },
  {
    q: "Que vulnerabilidades deteta?",
    a: "XSS refletido, SQL Injection, SSRF, LFI/Path Traversal, open redirect, command injection, CORS misconfiguration, security headers em falta, TLS/SSL fraco, exposed files, directory listing, subdomain takeover.",
  },
  {
    q: "Como funciona a integração com CI/CD?",
    a: "O CLI pode correr em qualquer pipeline: GitHub Actions, GitLab CI, Jenkins, CircleCI. Basta adicionar um step que falha o build se encontrar vulnerabilidades acima de um threshold.",
  },
  {
    q: "Guardam dados das minhas aplicações?",
    a: "Não. A versão self-hosted não envia dados para fora. A versão hosted armazena apenas metadata das visitas e relatórios.",
  },
  {
    q: "É realmente gratuito?",
    a: "Sim. O código está sob licença MIT — podes usar, modificar e distribuir sem custos. Não há plano pago.",
  },
];

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="py-20 sm:py-24 border-t border-neutral/10">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="section-title-wrap">
          <h2 className="section-title">
            Perguntas <span className="grad-text">frequentes</span>.
          </h2>
          <p className="section-subtitle">
            Tudo o que precisas de saber antes de começar.
          </p>
        </div>

        <div className="faq-premium-list">
          {FAQS.map((item, i) => (
            <div
              key={i}
              className={`faq-premium-item ${open === i ? "open" : ""}`}
            >
              <button
                className="faq-premium-trigger"
                onClick={() => setOpen(open === i ? null : i)}
                aria-expanded={open === i}
              >
                <span className="faq-premium-q">{item.q}</span>
                <span className="faq-premium-icon" aria-hidden="true" />
              </button>
              <div className="faq-premium-content">
                <div className="faq-premium-answer">{item.a}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}