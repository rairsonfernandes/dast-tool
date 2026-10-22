import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePageMeta } from '@/lib/usePageMeta';

const NotFound = () => {
  const navigate = useNavigate();
  const [hasHistory, setHasHistory] = useState(false);
  usePageMeta();

  useEffect(() => {
    setHasHistory(window.history.length > 1);
  }, []);

  const handleBack = () => {
    if (hasHistory) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  return (
    <>
      <style>{`
        .nf-page {
          position: relative;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          overflow: hidden;
          background: #090909;
          color: #f4f4ee;
          font-family: 'Inter', system-ui, sans-serif;
          line-height: 1.6;
        }
        .nf-page::before {
          content: '';
          position: fixed;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          background:
            radial-gradient(ellipse 80% 50% at 50% -10%, rgba(0, 255, 102, 0.06), transparent 60%),
            radial-gradient(ellipse 60% 40% at 100% 100%, rgba(0, 255, 102, 0.03), transparent 70%),
            linear-gradient(180deg, #090909 0%, #0b0b0b 50%, #080808 100%);
        }
        .nf-page::after {
          content: '';
          position: fixed;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          opacity: 0.35;
          background-image:
            linear-gradient(rgba(255, 255, 255, 0.018) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.018) 1px, transparent 1px);
          background-size: 60px 60px;
          -webkit-mask-image: radial-gradient(ellipse at center, black 30%, transparent 80%);
          mask-image: radial-gradient(ellipse at center, black 30%, transparent 80%);
        }
        .nf-container {
          position: relative;
          z-index: 1;
          text-align: center;
          max-width: 640px;
          width: 100%;
        }
        .nf-code {
          font-family: 'Space Grotesk', 'Montserrat', system-ui, sans-serif;
          font-size: clamp(120px, 30vw, 240px);
          font-weight: 900;
          letter-spacing: -0.08em;
          line-height: 0.85;
          color: transparent;
          -webkit-text-stroke: 1.5px #79796f;
          margin-bottom: 16px;
          position: relative;
          animation: nfFadeUp 0.6s ease-out;
        }
        .nf-code::after {
          content: '404';
          position: absolute;
          inset: 0;
          color: #00FF66;
          -webkit-text-stroke: 0;
          opacity: 0.18;
          filter: blur(30px);
          z-index: -1;
        }
        .nf-title {
          font-family: 'Space Grotesk', 'Montserrat', system-ui, sans-serif;
          font-size: clamp(28px, 5vw, 42px);
          font-weight: 800;
          letter-spacing: -0.03em;
          text-transform: uppercase;
          margin-bottom: 16px;
          color: #f4f4ee;
          animation: nfFadeUp 0.6s ease-out 0.1s both;
        }
        .nf-title span { color: #00FF66; }
        .nf-message {
          color: #8a8a82;
          font-size: 15px;
          line-height: 1.7;
          max-width: 460px;
          margin: 0 auto 32px;
          animation: nfFadeUp 0.6s ease-out 0.2s both;
        }
        .nf-actions {
          display: flex;
          gap: 12px;
          justify-content: center;
          flex-wrap: wrap;
          animation: nfFadeUp 0.6s ease-out 0.3s both;
        }
        .nf-btn {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 15px 22px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          font-weight: 700;
          border: 1px solid rgba(255, 255, 255, 0.1);
          transition: all 0.25s ease;
          cursor: pointer;
          text-decoration: none;
          color: #f4f4ee;
          min-height: 52px;
          border-radius: 0;
          background: transparent;
        }
        .nf-btn:hover { transform: translateY(-3px); }
        .nf-btn-primary {
          background: #00FF66;
          border-color: #00FF66;
          color: #090909;
        }
        .nf-btn-primary:hover {
          background: #00E676;
          border-color: #00E676;
          box-shadow: 0 12px 40px rgba(0, 255, 102, 0.25);
          color: #090909;
        }
        .nf-btn-secondary:hover {
          border-color: #00FF66;
          color: #00FF66;
        }
        .nf-footer {
          margin-top: 48px;
          padding-top: 24px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #8a8a82;
          animation: nfFadeUp 0.6s ease-out 0.4s both;
        }
        .nf-footer a {
          color: #00FF66;
          text-decoration: none;
          border-bottom: 1px solid transparent;
          transition: border-color 0.2s;
        }
        .nf-footer a:hover { border-bottom-color: #00FF66; }
        @keyframes nfFadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 600px) {
          .nf-actions { flex-direction: column; }
          .nf-btn { width: 100%; justify-content: center; }
        }
      `}</style>

      <div className="nf-page">
        <div className="nf-container">
          <div className="nf-code">404</div>

          <h1 className="nf-title">
            Página não<br />
            <span>encontrada.</span>
          </h1>

          <p className="nf-message">
            A página que procuras não existe, foi movida ou o endereço está
            incorreto. Verifica o URL ou volta ao início.
          </p>

          <div className="nf-actions">
            <button onClick={handleBack} className="nf-btn nf-btn-primary">
              Voltar ao início <span aria-hidden>↗</span>
            </button>
            <Link to="/dashboard" className="nf-btn nf-btn-secondary">
              Ir para o dashboard
            </Link>
            <Link to="/scans" className="nf-btn nf-btn-secondary">
              Ver scans
            </Link>
          </div>

          <div className="nf-footer">
            SENTINEL<span style={{ color: '#00FF66' }}>®</span> ·{' '}
            <a href="/">sentinel.app</a>
          </div>
        </div>
      </div>
    </>
  );
};

export default NotFound;