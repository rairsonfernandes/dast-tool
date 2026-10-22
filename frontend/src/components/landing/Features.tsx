import {
  SearchIcon,
  ShieldCheckIcon,
  FileTextIcon,
  FilterIcon,
  HistoryIcon,
  DownloadIcon,
} from "@/components/LandingIcons";

const FEATURES = [
  { Icon: SearchIcon, title: "Deteção automatizada", desc: "Analisa aplicações web à procura de vulnerabilidades comuns, reduzindo o esforço de testes manuais repetitivos." },
  { Icon: ShieldCheckIcon, title: "Cobertura OWASP Top 10", desc: "Organiza as verificações em torno das principais categorias de risco de aplicações web." },
  { Icon: FileTextIcon, title: "Relatórios acionáveis", desc: "Evidências, severidade, endpoints afetados e recomendações técnicas para orientar a correção." },
  { Icon: FilterIcon, title: "Resultados priorizados", desc: "Identifica primeiro os problemas que exigem maior atenção, ajudando as equipas a organizar a remediação." },
  { Icon: HistoryIcon, title: "Histórico de análises", desc: "Compara resultados de diferentes execuções para acompanhar a evolução da segurança." },
  { Icon: DownloadIcon, title: "Exportação de resultados", desc: "Exporta findings em JSON ou PDF para partilha com equipas técnicas e stakeholders." },
];

export function Features() {
  return (
    <section id="features" className="py-20 sm:py-24">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="section-title-wrap">
          <h2 className="section-title">
            Tudo o que precisas para <span className="grad-text">proteger</span> as tuas aplicações.
          </h2>
          <p className="section-subtitle">
            Uma abordagem automatizada para identificar riscos, compreender o impacto
            e acelerar a correção.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map(({ Icon, title, desc }) => (
            <div key={title} className="feature-card-premium">
              <div className="feature-icon-premium">
                <Icon size={22} />
              </div>
              <h3 className="feature-title">{title}</h3>
              <p className="feature-desc">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}