import { Link } from "react-router-dom";
import { ArrowRightIcon } from "@/components/LandingIcons";

const FINDINGS = [
  { path: "/api/v1/auth/login", severity: "critical", label: "SQLi · Crítico" },
  { path: "/admin/dashboard", severity: "critical", label: "XSS · Alto" },
  { path: "/user/profile", severity: "high", label: "CSRF · Alto" },
  { path: "/api/data/export", severity: "medium", label: "CORS · Médio" },
];

export function Hero() {
  return (
    <section className="hero-bg">
      <div className="relative max-w-7xl mx-auto px-6 lg:px-8 pt-32 lg:pt-40 pb-24 lg:pb-32">
        <div className="grid lg:grid-cols-12 gap-12 items-center">
          {/* Texto */}
          <div className="lg:col-span-6">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-accent/10 border border-accent/25 text-accent text-xs font-bold tracking-widest uppercase mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              Automated Web Security Testing
            </div>

            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.05] tracking-tight text-white mb-6">
              A segurança da tua<br />
              aplicação web.{" "}
              <span className="grad-text">Em minutos,</span>
              <br />
              não em horas.
            </h1>

            <p className="hero-description text-base sm:text-lg leading-relaxed max-w-xl mb-8">
              Deteta vulnerabilidades web automaticamente com testes alinhados com
              o OWASP Top 10. Transforma auditorias demoradas em análises rápidas,
              acionáveis e fáceis de interpretar.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 mb-12">
              <Link
                to="/register"
                className="btn-accent inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full text-sm font-bold"
              >
                Analisar aplicação
                <ArrowRightIcon size={16} />
              </Link>
              <a
                href="#demo"
                className="btn-ghost inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full text-sm font-semibold"
              >
                Ver demonstração
              </a>
            </div>

            <div className="grid grid-cols-3 gap-6 pt-8 border-t border-neutral/10">
              <div>
                <div className="font-display text-2xl sm:text-3xl font-extrabold text-accent">15min</div>
                <div className="text-xs text-neutral/60 mt-1 uppercase tracking-wider">Por auditoria</div>
              </div>
              <div>
                <div className="font-display text-2xl sm:text-3xl font-extrabold text-accent">OWASP</div>
                <div className="text-xs text-neutral/60 mt-1 uppercase tracking-wider">Top 10 coberto</div>
              </div>
              <div>
                <div className="font-display text-2xl sm:text-3xl font-extrabold text-accent">13</div>
                <div className="text-xs text-neutral/60 mt-1 uppercase tracking-wider">Módulos</div>
              </div>
            </div>
          </div>

          {/* Imagem + dashboard overlay */}
          <div className="lg:col-span-6 flex justify-center">
            <div className="hero-img-wrapper">
              <img
                src="/img/hero.png"
                alt="Sentinel dashboard"
                loading="eager"
                onError={(e) => { e.currentTarget.style.display = "none"; }}
              />
            </div>
          </div>
        </div>

        {/* Dashboard card flutuante */}
        <div className="mt-16 max-w-3xl mx-auto glass rounded-2xl border border-border-mid overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-bg-2-50">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-neutral-15" />
              <span className="w-2.5 h-2.5 rounded-full bg-neutral-15" />
              <span className="w-2.5 h-2.5 rounded-full bg-neutral-15" />
            </div>
            <div className="font-mono text-[10px] text-neutral-50 tracking-widest uppercase">
              sentinel — live scan
            </div>
          </div>
          <div className="p-6">
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-neutral/10">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent-10 border border-border-acc text-accent text-[10px] font-bold uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                Live scan
              </div>
              <span className="font-mono text-xs text-neutral-50">app.example.com</span>
            </div>

            <div className="space-y-2 mb-4">
              {FINDINGS.map((f) => (
                <div
                  key={f.path}
                  className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-bg-50 border border-border"
                >
                  <span className="font-mono text-xs text-neutral-70 truncate mr-3">{f.path}</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex-shrink-0 ${
                      f.severity === "critical"
                        ? "bg-[#F87171]/10 text-[#F87171]"
                        : f.severity === "high"
                        ? "bg-[#FBBF24]/10 text-[#FBBF24]"
                        : "bg-accent/10 text-accent"
                    }`}
                  >
                    {f.label}
                  </span>
                </div>
              ))}
            </div>

            <div className="h-1.5 rounded-full bg-neutral/10 overflow-hidden">
              <div className="h-full w-[78%] rounded-full bg-gradient-to-r from-accent to-[#1FD9C8] shadow-[0_0_12px_var(--accent)]" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}