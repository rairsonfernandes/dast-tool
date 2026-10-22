import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, startOAuth } from '@/lib/api';
import { auth, setUser, touchActivity, isAuthenticated } from '@/lib/auth';
import { usePageMeta } from '@/lib/usePageMeta';
import './auth.css';

function pwScore(pw: string): { level: 'weak' | 'medium' | 'strong' | ''; label: string } {
  if (!pw) return { level: '', label: '' };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 2) return { level: 'weak', label: 'Fraca' };
  if (score <= 3) return { level: 'medium', label: 'Média' };
  return { level: 'strong', label: 'Forte' };
}

type State =
  | { status: 'form' }
  | { status: 'success'; email: string };

export default function Register() {
  const navigate = useNavigate();
  usePageMeta();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<State>({ status: 'form' });

  const strength = pwScore(password);

  useEffect(() => {
    if (isAuthenticated() && state.status === 'form') {
      navigate('/dashboard', { replace: true });
    }
  }, [navigate, state.status]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!acceptTerms) {
      setError('Deves aceitar os Termos e a Política de Privacidade para continuar.');
      return;
    }
    if (password.length < 8) {
      setError('A password deve ter pelo menos 8 caracteres.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/api/auth/register', {
        name: name.trim() || undefined,
        email,
        password,
      });
      auth.setToken(res.data.token);
      if (res.data.user) setUser(res.data.user);
      touchActivity();

      // Em vez de redirecionar logo, mostra tela de sucesso
      setState({ status: 'success', email });
    } catch (err: any) {
      const status = err?.response?.status;
      const msg = err?.response?.data?.error;

      if (status === 409) {
        setError(
          msg ||
            'Este email já está registado. Se a conta te pertence, tenta entrar ou recuperar a password.',
        );
      } else if (status === 400) {
        setError(msg || 'Verifica os dados introduzidos.');
      } else if (status === 429) {
        setError('Demasiadas tentativas. Aguarda alguns minutos antes de tentar novamente.');
      } else {
        setError('Não foi possível criar a conta. Tenta novamente.');
      }
    } finally {
      setLoading(false);
    }
  }

  // ============================================
  // SUCESSO
  // ============================================
  if (state.status === 'success') {
    return (
      <div className="auth-page">
        <div className="auth-panel">
          <div className="auth-panel-inner">
            <div className="auth-header">
              <Link to="/" className="auth-header-brand">
                SENT<span>I</span>NEL
              </Link>
            </div>

            <h1 className="auth-title">Conta criada com sucesso</h1>
            <p className="auth-subtitle">
              Bem-vindo ao Sentinel. A tua conta{' '}
              <strong className="text-white">{state.email}</strong> está pronta a usar.
            </p>

            <div className="auth-alert success">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <div>
                <strong>Sessão iniciada automaticamente.</strong>
                <p style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.5 }}>
                  Podes começar já a analisar a segurança da tua primeira aplicação.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigate('/dashboard', { replace: true })}
              className="auth-submit"
            >
              Ir para o dashboard →
            </button>

            <p className="auth-footer">
              O que podes fazer agora:
              <br />
              · Criar o primeiro scan a uma aplicação web
              <br />
              · Configurar os teus canais de notificação
              <br />
              · Convidar colegas para a tua organização
            </p>
          </div>
        </div>

        <aside className="auth-visual" aria-hidden="true">
          <div className="auth-visual-content">
            <Link to="/" className="auth-visual-brand">
              SENT<span>I</span>NEL
            </Link>
            <div className="auth-visual-quote">
              <span className="quote-badge">
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />
                Bem-vindo
              </span>
              <h3>O teu primeiro scan demora menos de 15 minutos.</h3>
              <p>
                A partir do dashboard, indica o URL da tua aplicação e o Sentinel
                corre os 13 módulos de deteção automaticamente.
              </p>
            </div>
          </div>
        </aside>
      </div>
    );
  }

  // ============================================
  // FORM
  // ============================================
  return (
    <div className="auth-page">
      <div className="auth-panel">
        <div className="auth-panel-inner">
          <div className="auth-header">
            <Link to="/" className="auth-header-brand">
              SENT<span>I</span>NEL
            </Link>
            <Link to="/login" className="auth-header-link">
              Já tens conta? <strong>Entrar</strong>
            </Link>
          </div>

          <h1 className="auth-title">Criar conta</h1>
          <p className="auth-subtitle">
            Começa a analisar a segurança da tua aplicação em minutos. Sem cartão de crédito.
          </p>

          {error && (
            <div className="auth-alert error">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <div className="auth-oauth-group">
            <button
              type="button"
              className="auth-oauth-btn"
              onClick={() => startOAuth('google')}
              disabled={loading}
            >
              <svg viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Google
            </button>
            <button
              type="button"
              className="auth-oauth-btn"
              onClick={() => startOAuth('github')}
              disabled={loading}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
              </svg>
              GitHub
            </button>
          </div>

          <div className="auth-divider">ou com email</div>

          <form onSubmit={handleSubmit}>
            <div className="auth-field">
              <label htmlFor="name">Nome completo</label>
              <div className="auth-input-wrap">
                <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <input
                  id="name"
                  type="text"
                  className="auth-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alex Mercer"
                  autoComplete="name"
                />
              </div>
            </div>

            <div className="auth-field">
              <label htmlFor="email">Email</label>
              <div className="auth-input-wrap">
                <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <polyline points="3 7 12 13 21 7" />
                </svg>
                <input
                  id="email"
                  type="email"
                  className="auth-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@exemplo.com"
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <div className="auth-field">
              <label htmlFor="password">Password</label>
              <div className="auth-input-wrap">
                <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  className="auth-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="auth-toggle-pw"
                  onClick={() => setShowPw(!showPw)}
                  aria-label={showPw ? 'Ocultar password' : 'Mostrar password'}
                >
                  {showPw ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
              {password && (
                <div className="auth-pw-strength">
                  <div className="auth-pw-strength-bar">
                    <div className={`auth-pw-strength-fill ${strength.level}`} />
                  </div>
                  <span className={`auth-pw-strength-label ${strength.level}`}>
                    {strength.label}
                  </span>
                </div>
              )}
            </div>

            <div className="auth-row">
              <label className="auth-checkbox">
                <input
                  type="checkbox"
                  checked={acceptTerms}
                  onChange={(e) => setAcceptTerms(e.target.checked)}
                />
                Aceito os <Link to="/terms" className="auth-link">Termos</Link> e a{' '}
                <Link to="/privacy" className="auth-link">Privacidade</Link>
              </label>
            </div>

            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? 'A criar conta...' : 'Criar conta'}
            </button>
          </form>

          <p className="auth-legal">
            O Sentinel é open source e gratuito. Sem cartão de crédito.
          </p>
        </div>
      </div>

      <aside className="auth-visual" aria-hidden="true">
        <div className="auth-visual-content">
          <Link to="/" className="auth-visual-brand">
            SENT<span>I</span>NEL
          </Link>
          <div className="auth-visual-quote">
            <span className="quote-badge">
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />
              Open source
            </span>
            <h3>Cada camada do OWASP Top 10, coberta por um módulo dedicado.</h3>
            <p>
              XSS, SQL Injection, SSRF, LFI, CORS, TLS e muito mais.
              Self-hosted, sem conta obrigatória.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}