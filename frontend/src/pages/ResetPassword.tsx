import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { usePageMeta } from '@/lib/usePageMeta';
import './auth.css';

type TokenState =
  | { status: 'checking' }
  | { status: 'valid' }
  | { status: 'invalid'; reason: string };

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

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  usePageMeta();

  const token = (params.get('token') || '').trim();

  const [tokenState, setTokenState] = useState<TokenState>({ status: 'checking' });
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const strength = pwScore(password);

  // Verifica o token ao entrar
  useEffect(() => {
    if (!token) {
      setTokenState({ status: 'invalid', reason: 'missing' });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<{ valid: boolean; reason?: string }>(
          '/api/auth/reset-password/verify',
          { params: { token } }
        );
        if (cancelled) return;
        if (res.data?.valid) {
          setTokenState({ status: 'valid' });
        } else {
          setTokenState({ status: 'invalid', reason: res.data?.reason || 'invalid' });
        }
      } catch {
        if (!cancelled) {
          setTokenState({ status: 'invalid', reason: 'network' });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('A password deve ter pelo menos 8 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('As passwords não coincidem.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/api/auth/reset-password', { token, password });
      setDone(true);
      // Redireciona para o login depois de 2s com mensagem de sucesso
      setTimeout(() => {
        navigate('/login?reset=success', { replace: true });
      }, 1800);
    } catch (err: any) {
      setError(
        err.response?.data?.error ||
          'Não foi possível redefinir a password. Pede um novo link.'
      );
    } finally {
      setLoading(false);
    }
  }

  // ============================================
  // ESTADOS
  // ============================================
  if (tokenState.status === 'checking') {
    return (
      <div className="auth-page">
        <div className="auth-panel">
          <div className="auth-panel-inner">
            <h1 className="auth-title">A validar link…</h1>
            <p className="auth-subtitle">
              <i className="fa-solid fa-spinner animate-spin mr-2" />
              A verificar o teu link de recuperação.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (tokenState.status === 'invalid') {
    const messages: Record<string, string> = {
      missing: 'O link não tem um token. Pede um novo email de recuperação.',
      invalid: 'Este link é inválido. Pede um novo email de recuperação.',
      used: 'Este link já foi utilizado. Pede um novo email de recuperação.',
      expired: 'Este link expirou. Pede um novo email de recuperação.',
      network: 'Não foi possível validar o link. Verifica a tua ligação.',
    };
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

            <h1 className="auth-title">Link inválido</h1>
            <div className="auth-alert error">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{messages[tokenState.reason] || messages.invalid}</span>
            </div>

            <Link
              to="/forgot-password"
              className="auth-submit"
              style={{ textDecoration: 'none', textAlign: 'center' }}
            >
              Pedir novo link
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="auth-page">
        <div className="auth-panel">
          <div className="auth-panel-inner">
            <div className="auth-header">
              <Link to="/" className="auth-header-brand">
                SENT<span>I</span>NEL
              </Link>
            </div>
            <h1 className="auth-title">Password redefinida</h1>
            <div className="auth-alert success">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>Password alterada com sucesso. A redirecionar para o login…</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // FORM VÁLIDO
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
              <strong>← Voltar ao login</strong>
            </Link>
          </div>

          <h1 className="auth-title">Nova password</h1>
          <p className="auth-subtitle">
            Escolhe uma nova password para a tua conta. O link só funciona uma vez.
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

          <form onSubmit={handleSubmit}>
            <div className="auth-field">
              <label htmlFor="password">Nova password</label>
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
                  autoFocus
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

            <div className="auth-field">
              <label htmlFor="confirm">Confirmar password</label>
              <div className="auth-input-wrap">
                <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <input
                  id="confirm"
                  type={showPw ? 'text' : 'password'}
                  className="auth-input"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repetir password"
                  autoComplete="new-password"
                  required
                />
              </div>
            </div>

            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? 'A guardar…' : 'Guardar nova password'}
            </button>
          </form>

          <p className="auth-footer">
            Lembraste-te? <Link to="/login">Entrar</Link>
          </p>
        </div>
      </div>

      <aside className="auth-visual" aria-hidden="true">
        <div className="auth-visual-content">
          <Link to="/" className="auth-visual-brand">
            SENT<span>I</span>NEL
          </Link>
          <div className="auth-visual-quote">
            <span className="quote-badge">Segurança</span>
            <h3>O link expira em 30 minutos e só funciona uma vez.</h3>
            <p>
              Se o link expirar, pede um novo em "Esqueceste-te da password?".
              Nunca partilhamos a tua password com ninguém.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}