import { Check, X } from "lucide-react";

// ============================================
// DADOS
// ============================================
const MAKES = [
  "Deteta vulnerabilidades OWASP Top 10 em aplicações web expostas",
  "Gera relatórios JSON e PDF com evidências",
  "Corre em Docker e integra-se em pipelines CI/CD",
  "Funciona em modo self-hosted, sem telemetria obrigatória",
  "Cobre 13 vetores com módulos independentes",
];

const NOT_MAKES = [
  "Não substitui uma auditoria de segurança manual ou pentest profissional",
  "Não acede a sistemas internos sem configuração explícita",
  "Não garante cobertura de todas as vulnerabilidades — é ferramenta de deteção, não prova de segurança",
  "Não faz exploração (exploit) — identifica, reporta, para",
  "Não tem SLA, SOC 2, ISO 27001 nem suporte dedicado — é open source, mantido por uma pessoa",
];

// ============================================
// COMPONENTE
// ============================================
export function Transparency() {
  return (
    <section
      className="py-24 px-6 border-t"
      style={{
        backgroundColor: "#0B1220", // bg-bg (azul escuro)
        borderColor: "rgba(241, 245, 249, 0.08)", // border.DEFAULT
      }}
    >
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="max-w-2xl mb-12">
          <p
            className="text-xs font-mono uppercase tracking-wider mb-3"
            style={{ color: "#16C7B7" }} // accent
          >
            Transparência
          </p>
          <h2
            className="text-3xl md:text-4xl font-bold tracking-tight mb-4"
            style={{ color: "#F1F5F9" }} // text.DEFAULT
          >
            O que faz e o que não faz.
          </h2>
          <p
            className="leading-relaxed"
            style={{ color: "rgba(241, 245, 249, 0.55)" }} // text.muted
          >
            Nenhuma ferramenta de segurança substitui julgamento humano. Aqui
            está exatamente o que esperar do Sentinel — sem hype, sem promessas
            que não cumprimos.
          </p>
        </div>

        {/* Grid */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* O que faz */}
          <div
            className="p-6 rounded-xl"
            style={{
              backgroundColor: "#101A2E", // surface
              border: "1px solid rgba(241, 245, 249, 0.08)", // border.DEFAULT
            }}
          >
            <h3
              className="text-sm font-mono uppercase tracking-wider mb-4"
              style={{ color: "#16C7B7" }} // accent
            >
              O que faz
            </h3>
            <ul className="space-y-3">
              {MAKES.map((item, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 text-sm"
                  style={{ color: "rgba(241, 245, 249, 0.55)" }} // text.muted
                >
                  <Check
                    className="w-4 h-4 flex-shrink-0 mt-0.5"
                    style={{ color: "#16C7B7" }} // accent
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* O que não faz */}
          <div
            className="p-6 rounded-xl"
            style={{
              backgroundColor: "#101A2E", // surface
              border: "1px solid rgba(241, 245, 249, 0.08)", // border.DEFAULT
            }}
          >
            <h3
              className="text-sm font-mono uppercase tracking-wider mb-4"
              style={{ color: "#F87171" }} // danger
            >
              O que não faz
            </h3>
            <ul className="space-y-3">
              {NOT_MAKES.map((item, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 text-sm"
                  style={{ color: "rgba(241, 245, 249, 0.55)" }} // text.muted
                >
                  <X
                    className="w-4 h-4 flex-shrink-0 mt-0.5"
                    style={{ color: "#F87171" }} // danger
                  />
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