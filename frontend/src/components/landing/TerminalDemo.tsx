import { useEffect, useRef, useState } from "react";
import {
  mediaConfig,
  resolveMediaType,
  getYouTubeEmbedUrl,
  getVimeoEmbedUrl,
} from "@/config/media";

const LINES = [
  { type: "command", text: "$ dast-scanner scan https://demo.example.com" },
  { type: "info", text: "[INFO] A iniciar análise..." },
  { type: "info", text: "[INFO] A verificar endpoints acessíveis..." },
  { type: "info", text: "[INFO] A executar testes de segurança..." },
  { type: "info", text: "[INFO] A classificar resultados..." },
  { type: "blank", text: "" },
  { type: "warn", text: "[WARN] 2 findings de severidade alta" },
  { type: "info", text: "[INFO] 3 findings de severidade média" },
  { type: "info", text: "[INFO] 4 findings de severidade baixa" },
  { type: "blank", text: "" },
  { type: "success", text: "[ OK ] Análise concluída" },
  { type: "blank", text: "" },
  { type: "dim", text: "Tempo ilustrativo: 00:15:00" },
  { type: "dim", text: "Relatório: ./reports/security-report.html" },
];

// ============================================================
// TERMINAL ANIMADO (fallback sempre funcional)
// ============================================================
function AnimatedTerminal() {
  const [visibleLines, setVisibleLines] = useState(0);

  useEffect(() => {
    if (visibleLines >= LINES.length) {
      const timer = setTimeout(() => setVisibleLines(0), 5000);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => setVisibleLines((n) => n + 1), 550);
    return () => clearTimeout(timer);
  }, [visibleLines]);

  return (
    <div className="terminal">
      <div className="terminal-header">
        <div className="terminal-title">
          <span className="terminal-title-dot" />
          security-scan
        </div>
        <span className="terminal-badge">DEMO</span>
      </div>
      <div className="terminal-body">
        {LINES.slice(0, visibleLines).map((line, i) => (
          <span key={i} className={`terminal-line ${line.type}`}>
            {line.text}
            {i === visibleLines - 1 && visibleLines < LINES.length && (
              <span className="cursor" />
            )}
          </span>
        ))}
        {visibleLines === 0 && (
          <span className="terminal-line info">
            <span className="cursor" />
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================================
// VÍDEO LOCAL (public/video/demo.mp4)
// ============================================================
function LocalVideo({ src }: { src: string }) {
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

  if (failed) return <AnimatedTerminal />;

  return (
    <div
      className="video-showcase"
      onClick={togglePlay}
      role="button"
      tabIndex={0}
      aria-label="Reproduzir demonstração"
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          togglePlay();
        }
      }}
    >
      <span className="video-badge">
        <span className="dot" />
        DEMO · {mediaConfig.videoDuration}
      </span>

      <video
        ref={videoRef}
        src={src}
        playsInline
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => setFailed(true)}
        controls={playing}
      />

      {!playing && (
        <div className="video-play-overlay">
          <div className="play-btn-big" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// YOUTUBE EMBED
// ============================================================
function YouTubeEmbed({ videoId }: { videoId: string }) {
  return (
    <div className="video-showcase video-showcase-embed">
      <span className="video-badge">
        <span className="dot" />
        DEMO · YouTube
      </span>
      <div className="video-iframe-wrap">
        <iframe
          src={getYouTubeEmbedUrl(videoId)}
          title={mediaConfig.videoTitle}
          frameBorder={0}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      </div>
    </div>
  );
}

// ============================================================
// VIMEO EMBED
// ============================================================
function VimeoEmbed({ videoId }: { videoId: string }) {
  return (
    <div className="video-showcase video-showcase-embed">
      <span className="video-badge">
        <span className="dot" />
        DEMO · Vimeo
      </span>
      <div className="video-iframe-wrap">
        <iframe
          src={getVimeoEmbedUrl(videoId)}
          title={mediaConfig.videoTitle}
          frameBorder={0}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
        />
      </div>
    </div>
  );
}

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================
export function TerminalDemo() {
  const [mediaType] = useState(() => resolveMediaType());

  const renderMedia = () => {
    switch (mediaType) {
      case "local":
        return <LocalVideo src={mediaConfig.localVideoUrl} />;
      case "youtube":
        return <YouTubeEmbed videoId={mediaConfig.youtubeVideoId} />;
      case "vimeo":
        return <VimeoEmbed videoId={mediaConfig.vimeoVideoId} />;
      case "terminal":
      default:
        return <AnimatedTerminal />;
    }
  };

  return (
    <section className="section" id="demo">
      <div className="container">
        <div
          className="section-header"
          style={{ textAlign: "center", margin: "0 auto 56px" }}
        >
          <div className="section-label">Demonstração</div>
          <h2>
            Vê o scanner <span className="accent">em ação</span>.
          </h2>
          <p className="section-description">
            Um scan completo em menos de 15 minutos. Sem configuração
            complexa, sem falsos positivos.
          </p>
        </div>

        <div className="max-w-4xl mx-auto">{renderMedia()}</div>
      </div>
    </section>
  );
}