import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, startOAuth } from '@/lib/api';
import { auth, setUser, touchActivity, isAuthenticated } from '@/lib/auth';
import { usePageMeta } from '@/lib/usePageMeta';
import './auth.css';

type Banner =
  | { kind: 'success'; title: string; message: string }
  | null;

export default function Login() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  usePageMeta();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);

  useEffect(() => {
    // Já autenticado → dashboard
    if (isAuthenticated()) {
      navigate('/dashboard', { replace: true });
      return;
    }

    // OAuth callback
    const token = params.get('token');
    if (token) {
      // Limpar token da URL imediatamente (segurança + histórico)
      const clean = new URLSearchParams(params);
      clean.delete('token');
      setParams(clean, { replace: true });

      auth.setToken(token);
      touchActivity();
      api
        .get('/api/auth/me')
        .then((res) => {
          if (res.data) setUser(res.data);
          navigate('/dashboard', { replace: true });
        })
        .catch(() => {
          auth.clear();
          setError('Falha ao validar a sessão. Tenta entrar novamente.');
        });
      return;
    }

    // Banners de sistema
    if (params.get('reset') === 'success') {
      setBanner({
        kind: 'success',
        title: 'Password redefinida',
        message: 'Podes entrar com a nova password que acabaste de definir.',
      });
    }

    if (params.get('expired') === '1') {
      setError('A tua sessão expirou. Faz login novamente.');
    }

    // Erros OAuth
    const err = params.get('error');
    if (err) {
      const messages: Record<string, string> = {
        no_email: 'Não conseguimos obter o teu email. Tenta outro método de login.',
        email_not_verified: 'O email da tua conta ainda não está verificado.',
        oauth_denied: 'Cancelaste o login. Podes tentar novamente.',
        oauth_start_failed: 'Não foi possível iniciar o login com esse provider.',
        oauth_failed: 'Falha ao entrar com o provider. Tenta novamente.',
        invalid_state: 'A sessão de login expirou. Tenta novamente.',
      };
      setError(messages[err] ?? 'Falha ao autenticar. Tenta novamente.');
    }

    // Limpar params de sistema da URL (evita re-render infinito / banners presos)
    const clean = new URLSearchParams(params);
    let dirty = false;
    for (const key of ['reset', 'expired', 'error', 'registered']) {
      if (clean.has(key)) {
        clean.delete(key);
        dirty = true;
      }
    }
    if (dirty) setParams(clean, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBanner(null);
    setLoading(true);
    try {
      const res = await api.post('/api/auth/login', {
        email: email.trim().toLowerCase(),
        password,
      });
      auth.setToken(res.data.token, remember);
      if (res.data.user) setUser(res.data.user);
      touchActivity();
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      const status = err?.response?.status;
      const msg = err?.response?.data?.error;

      if (status === 401) {
        setError(
          msg ||
            'Email ou password incorretos. Se a conta foi criada com Google ou GitHub, usa o botão correspondente.',
        );
      } else if (status === 429) {
        setError('Demasiadas tentativas de login. Aguarda alguns minutos antes de tentar novamente.');
      } else if (status === 400) {
        setError(msg || 'Verifica o email e a password introduzidos.');
      } else {
        setError('Não foi possível entrar. Verifica a tua ligação à internet.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleOAuth(provider: 'google' | 'github') {
    setOauthLoading(provider);
    try {
      await startOAuth(provider);
    } catch {
      setOauthLoading(null);
      setError('Não foi possível iniciar o login com esse provider.');
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-panel">
        <div className="auth-panel-inner">
          <div className="auth-header">
            <Link to="/" className="auth-header-brand">
              SENT<span>I</span>NEL
            </Link>
            <Link to="/register" className="auth-header-link">
              Não tens conta? <strong>Criar conta</strong>
            </Link>
          </div>

          <h1 className="auth-title">Bem-vindo de volta</h1>
          <p className="auth-subtitle">
            Entra na tua conta para aceder ao dashboard de segurança.
          </p>

          {banner?.kind === 'success' && (
            <div className="auth-alert success" role="status" aria-live="polite">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <div>
                <strong>{banner.title}.</strong>
                <p style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.5 }}>
                  {banner.message}
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="auth-alert error" role="alert" aria-live="assertive">
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
              onClick={() => handleOAuth('google')}
              disabled={loading || oauthLoading !== null}
            >
              <svg viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              {oauthLoading === 'google' ? 'A redirecionar…' : 'Google'}
            </button>
            <button
              type="button"
              className="auth-oauth-btn"
              onClick={() => handleOAuth('github')}
              disabled={loading || oauthLoading !== null}
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
              </svg>
              {oauthLoading === 'github' ? 'A redirecionar…' : 'GitHub'}
            </button>
          </div>

          <div className="auth-divider">ou continua com email</div>

          <form onSubmit={handleSubmit}>
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
                  placeholder="••••••••"
                  autoComplete="current-password"
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
            </div>

            <div className="auth-row">
              <label className="auth-checkbox">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                Lembrar-me
              </label>
              <Link to="/forgot-password" className="auth-link">
                Esqueceste-te da password?
              </Link>
            </div>

            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? 'A entrar...' : 'Entrar'}
            </button>
          </form>

          <p className="auth-legal">
            Ao continuares, concordas com os{' '}
            <Link to="/terms">Termos</Link> e a{' '}
            <Link to="/privacy">Política de Privacidade</Link>.
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
              Trusted
            </span>
            <h3>Auditorias de segurança em 15 minutos, não em horas.</h3>
            <p>
              13 módulos de deteção. Cobertura completa do OWASP Top 10.
              Relatórios acionáveis. Open source.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}