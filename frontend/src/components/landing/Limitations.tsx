import { Check, X } from "lucide-react";

const MAKES = [
  "Deteta vulnerabilidades OWASP Top 10 em aplicações web expostas",
  "Gera relatórios JSON e PDF com evidências",
  "Corre em Docker e integra-se em CI/CD (GitHub Actions, GitLab CI)",
  "Funciona em modo self-hosted, sem telemetria obrigatória",
];

const NOT_MAKES = [
  "Não substitui uma auditoria de segurança manual ou pentest profissional",
  "Não acede a sistemas internos, redes privadas ou endpoints autenticados sem configuração explícita",
  "Não garante cobertura de todas as vulnerabilidades — é uma ferramenta de deteção, não uma prova de segurança",
  "Não faz exploração (exploit) — identifica, reporta, para",
];

export function Limitations() {
  return (
    <section className="py-24 px-6 border-t border-border">
      <div className="max-w-5xl mx-auto">
        <div className="max-w-2xl mb-12">
          <p className="text-xs font-mono uppercase tracking-wider text-accent mb-3">
            Transparência
          </p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
            O que faz e o que não faz.
          </h2>
          <p className="text-text-muted leading-relaxed">
            Nenhuma ferramenta de segurança substitui julgamento humano.
            Aqui está exatamente o que esperar do Sentinel.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* O que faz */}
          <div className="p-6 bg-surface border border-border rounded-xl">
            <h3 className="text-sm font-mono uppercase tracking-wider text-accent mb-4">
              O que faz
            </h3>
            <ul className="space-y-3">
              {MAKES.map((item, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-text-muted">
                  <Check className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* O que não faz */}
          <div className="p-6 bg-surface border border-border rounded-xl">
            <h3 className="text-sm font-mono uppercase tracking-wider text-danger mb-4">
              O que não faz
            </h3>
            <ul className="space-y-3">
              {NOT_MAKES.map((item, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-text-muted">
                  <X className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}