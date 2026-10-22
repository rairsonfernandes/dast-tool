import { Link } from "react-router-dom";
import { CheckIcon } from "@/components/LandingIcons";

const PLANS = [
  {
    name: "Free",
    description: "Para experimentar",
    price: "Gratuito",
    period: "sem cartão",
    features: [
      "Scans limitados",
      "Relatórios básicos",
      "Acesso às funcionalidades essenciais",
      "Sem conta obrigatória",
    ],
    cta: "Começar",
    href: "/register",
    featured: false,
  },
  {
    name: "Pro",
    description: "Para developers",
    price: "A definir",
    period: "por mês",
    features: [
      "Mais análises",
      "Relatórios detalhados",
      "Histórico de scans",
      "Exportação de resultados",
      "Integração CI/CD",
    ],
    cta: "Escolher Pro",
    href: "/register",
    featured: true,
  },
  {
    name: "Enterprise",
    description: "Para organizações",
    price: "Personalizado",
    period: "contacto",
    features: [
      "Gestão de equipas",
      "Controlos de acesso",
      "Integrações empresariais",
      "Suporte prioritário",
      "SLA dedicado",
    ],
    cta: "Falar com vendas",
    href: "mailto:raynfernande214@gmail.com",
    featured: false,
  },
];

export function Pricing() {
  return (
    <section className="section" id="pricing">
      <div className="container">
        <div className="section-header">
          <div className="section-label">Planos</div>
          <h2>
            Segurança adaptada à <span className="accent">tua equipa</span>.
          </h2>
          <p className="section-description">
            Começa com o essencial e evolui à medida que as tuas necessidades de
            segurança crescem.
          </p>
        </div>
        <div className="pricing-grid">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`pricing-card ${plan.featured ? "featured" : ""}`}
            >
              <div className="plan-name">{plan.name}</div>
              <div className="plan-description">{plan.description}</div>
              <div className="plan-price">{plan.price}</div>
              <div className="plan-period">{plan.period}</div>
              <ul className="plan-features">
                {plan.features.map((f) => (
                  <li key={f}>
                    <CheckIcon size={14} />
                    {f}
                  </li>
                ))}
              </ul>
              {plan.href.startsWith("http") || plan.href.startsWith("mailto") ? (
                <a href={plan.href} className="btn btn-secondary">
                  {plan.cta}
                </a>
              ) : (
                <Link to={plan.href} className="btn btn-secondary">
                  {plan.cta}
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}