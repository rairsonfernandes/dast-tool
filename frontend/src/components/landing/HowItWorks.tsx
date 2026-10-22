const STEPS = [
  {
    n: "01",
    title: "Define o alvo",
    desc: "Introduz o URL da aplicação que pretendes analisar.",
  },
  {
    n: "02",
    title: "Executa o scanner",
    desc: "A plataforma efetua os testes e recolhe evidências de vulnerabilidades.",
  },
  {
    n: "03",
    title: "Analisa e corrige",
    desc: "Consulta os resultados e utiliza as recomendações para corrigir.",
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="py-20 sm:py-24 border-y border-neutral/10 bg-bg-2-40">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="section-title-wrap">
          <h2 className="section-title">
            Da análise ao resultado em <span className="grad-text">três passos</span>.
          </h2>
        </div>
        <div className="grid sm:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {STEPS.map((s) => (
            <div key={s.n} className="step-card">
              <span className="step-number-big">{s.n}</span>
              <h3 className="step-title">{s.title}</h3>
              <p className="step-desc">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}