import { useRef, useState } from "react";
import { TerminalIcon } from "@/components/LandingIcons";

const STEPS = [
  { n: "01", title: "Instale em segundos", desc: "Corre em Docker ou instala via pip." },
  { n: "02", title: "Escolha o alvo", desc: "Um URL, uma API ou uma lista de endpoints." },
  { n: "03", title: "Analise os resultados", desc: "Recebes o relatório em JSON ou PDF." },
];

export function DemoVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (playing) {
      video.pause();
    } else {
      video.play().then(() => setPlaying(true)).catch(() => setFailed(true));
    }
  };

  return (
    <section id="demo" className="py-20 sm:py-24 border-y border-neutral/10 bg-bg-2-40">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="section-title-wrap">
          <h2 className="section-title">
            Vê, na prática, como o Sentinel{" "}
            <span className="grad-text">protege</span> a tua aplicação.
          </h2>
          <p className="section-subtitle">
            Um scan completo em menos de 15 minutos. Sem configuração complexa,
            sem falsos positivos.
          </p>
        </div>

        <div
          className="video-showcase max-w-4xl mx-auto"
          onClick={togglePlay}
          role="button"
          tabIndex={0}
          aria-label="Reproduzir demo"
        >
          <span className="video-badge">
            <span className="dot" />
            DEMO
          </span>

          <video
            ref={videoRef}
            src="/video/demo.mp4"
            playsInline
            preload="metadata"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onError={() => setFailed(true)}
            controls={playing}
          />

          {!playing && !failed && (
            <div className="video-play-overlay">
              <div className="play-btn-big" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          )}

          {failed && (
            <div className="absolute inset-0 grid place-items-center bg-bg-90 text-center p-8">
              <div>
                <TerminalIcon size={40} className="mx-auto text-accent mb-4" />
                <p className="text-white font-semibold mb-2">Demo indisponível</p>
                <p className="text-sm text-neutral-60">
                  O vídeo <code className="text-accent">/video/demo.mp4</code> não
                  pôde ser carregado.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="grid sm:grid-cols-3 gap-5 max-w-4xl mx-auto mt-12">
          {STEPS.map((s) => (
            <div
              key={s.n}
              className="glass-card p-6 rounded-2xl border border-border hover:border-border-acc transition"
            >
              <div className="font-mono text-xs text-accent tracking-widest mb-3">
                {s.n}
              </div>
              <h3 className="text-base font-bold text-white mb-2">{s.title}</h3>
              <p className="text-sm text-neutral-60 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}