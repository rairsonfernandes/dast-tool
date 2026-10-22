import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { usePageMeta } from '@/lib/usePageMeta';
import './auth.css';

type State =
  | { status: 'form' }
  | {
      status: 'sent';
      email: string;
      oauthOnly?: string;
      debugUrl?: string;
    };

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<State>({ status: 'form' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  usePageMeta();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/api/auth/forgot-password', { email });
      setState({
        status: 'sent',
        email,
        oauthOnly: res.data?.oauth_only,
        debugUrl: res.data?.debug_url,
      });
    } catch (err: any) {
      setError(
        err.response?.data?.error ||
          'Não foi possível processar o pedido. Tenta novamente.'
      );
    } finally {
      setLoading(false);
    }
  }

  const providerName = (() => {
    if (state.status !== 'sent') return '';
    const p = state.oauthOnly;
    if (p === 'google') return 'Google';
    if (p === 'github') return 'GitHub';
    return p || '';
  })();

  return (
    <div className="auth-page">
      <div className="auth-panel">
        <div className="auth-panel-inner">
          <div className="auth-header">
            <Link to="/" className="auth-header-brand">
              SENT<span>I</span>NEL
            </Link>
            <Link to="/login" className="auth-header-link">
              <strong>← Voltar ao login</strong>
            </Link>
          </div>

          {state.status === 'form' && (
            <>
              <h1 className="auth-title">Recuperar password</h1>
              <p className="auth-subtitle">
                Introduz o teu email. Se existir conta, enviaremos um link para
                redefinir a password.
              </p>

              {error && (
                <div className="auth-alert error">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div className="auth-field">
                  <label htmlFor="email">Email</label>
                  <div className="auth-input-wrap">
                    <svg
                      className="input-icon"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
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
                      autoFocus
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="auth-submit"
                  disabled={loading}
                >
                  {loading ? 'A enviar...' : 'Enviar link de recuperação'}
                </button>
              </form>

              <p className="auth-footer">
                Lembraste-te da password?{' '}
                <Link to="/login">Entrar</Link>
              </p>
            </>
          )}

          {state.status === 'sent' && providerName && (
            <>
              <h1 className="auth-title">
                Esta conta usa {providerName}
              </h1>
              <p className="auth-subtitle">
                A conta{' '}
                <strong className="text-white">{state.email}</strong> foi criada
                com {providerName} e não tem password associada.
              </p>

              <div className="auth-alert success">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <div>
                  <strong>Entra com {providerName}.</strong>
                  <p
                    style={{
                      margin: '6px 0 0',
                      fontSize: 13,
                      lineHeight: 1.5,
                    }}
                  >
                    Volta ao login e usa o botão{' '}
                    <strong>{providerName}</strong>.
                  </p>
                </div>
              </div>

              <Link
                to="/login"
                className="auth-submit"
                style={{ textDecoration: 'none', textAlign: 'center' }}
              >
                Ir para o login
              </Link>
            </>
          )}

          {state.status === 'sent' && !providerName && (
            <>
              <h1 className="auth-title">Verifica o teu email</h1>
              <p className="auth-subtitle">
                Se existir uma conta associada a{' '}
                <strong className="text-white">{state.email}</strong>, receberás
                um link para redefinir a password. O link expira em 30 minutos.
              </p>

              <div className="auth-alert success">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <div>
                  <strong>Pedido processado.</strong>
                  <p
                    style={{
                      margin: '6px 0 0',
                      fontSize: 13,
                      lineHeight: 1.5,
                    }}
                  >
                    Verifica a caixa de entrada (e o spam).
                  </p>
                  {state.debugUrl && (
                    <p
                      style={{
                        margin: '10px 0 0',
                        fontSize: 12,
                        fontFamily: 'monospace',
                        wordBreak: 'break-all',
                      }}
                    >
                      <strong>DEBUG:</strong>{' '}
                      <a
                        href={state.debugUrl}
                        style={{ color: 'var(--accent)' }}
                      >
                        {state.debugUrl}
                      </a>
                    </p>
                  )}
                </div>
              </div>

              <Link
                to="/login"
                className="auth-submit"
                style={{ textDecoration: 'none', textAlign: 'center' }}
              >
                Voltar ao login
              </Link>

              <p className="auth-footer">
                Não recebeste nada?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setState({ status: 'form' });
                    setEmail('');
                  }}
                  className="auth-link"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  Tentar novamente
                </button>
              </p>
            </>
          )}
        </div>
      </div>

      <aside className="auth-visual" aria-hidden="true">
        <div className="auth-visual-content">
          <Link to="/" className="auth-visual-brand">
            SENT<span>I</span>NEL
          </Link>
          <div className="auth-visual-quote">
            <span className="quote-badge">Segurança</span>
            <h3>Contas Google ou GitHub não têm password.</h3>
            <p>
              Detetamos automaticamente o método de login da tua conta e
              mostramos-te a opção correta. O link de recuperação expira em 30
              minutos e só funciona uma vez.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}