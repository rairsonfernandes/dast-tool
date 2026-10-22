import React, { useMemo } from 'react';

// ============================================
// CORES — paleta estável por utilizador
// ============================================
// O mesmo nome gera sempre o mesmo par de cores.
// Não usamos random → evita "salto" entre renders.

const PALETTES: { from: string; to: string; ring: string; text: string }[] = [
  { from: '#00FF66', to: '#00B34A', ring: 'rgba(0,255,102,0.45)', text: '#001A0A' },
  { from: '#00C2FF', to: '#0066CC', ring: 'rgba(0,194,255,0.45)', text: '#001A22' },
  { from: '#A855F7', to: '#6D28D9', ring: 'rgba(168,85,247,0.45)', text: '#1A0A2E' },
  { from: '#FF8800', to: '#C2410C', ring: 'rgba(255,136,0,0.45)', text: '#1A0A00' },
  { from: '#FF2E54', to: '#9F1239', ring: 'rgba(255,46,84,0.45)', text: '#1A0005' },
  { from: '#14B8A6', to: '#0F766E', ring: 'rgba(20,184,166,0.45)', text: '#00110E' },
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function getInitials(name: string): string {
  const cleaned = (name || '').trim();
  if (!cleaned) return 'U';

  // Tenta primeiro e último nome
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ============================================
// COMPONENTE
// ============================================
interface AvatarProps {
  name: string;
  src?: string | null;
  /** sm = 36px, md = 44px, lg = 56px, xl = 72px */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Mostra o ponto verde de "online" */
  online?: boolean;
  className?: string;
}

const SIZE_MAP = {
  sm: { box: 'w-9 h-9', text: 'text-[11px]', rounded: 'rounded-lg', dot: 'w-2.5 h-2.5' },
  md: { box: 'w-11 h-11', text: 'text-sm', rounded: 'rounded-lg', dot: 'w-3 h-3' },
  lg: { box: 'w-14 h-14', text: 'text-lg', rounded: 'rounded-xl', dot: 'w-3.5 h-3.5' },
  xl: { box: 'w-[72px] h-[72px]', text: 'text-2xl', rounded: 'rounded-2xl', dot: 'w-4 h-4' },
} as const;

const Avatar: React.FC<AvatarProps> = ({
  name,
  src,
  size = 'md',
  online = false,
  className = '',
}) => {
  const initials = useMemo(() => getInitials(name), [name]);
  const palette = useMemo(() => {
    const key = (name || '').trim().toLowerCase() || 'user';
    return PALETTES[hashString(key) % PALETTES.length];
  }, [name]);

  const s = SIZE_MAP[size];
  const ringId = `av-ring-${hashString(name || 'user')}`;

  return (
    <div className={`relative shrink-0 ${s.box} ${className}`}>
      {src ? (
        <img
          src={src}
          alt=""
          className={`w-full h-full object-cover ${s.rounded} border border-[#00FF66]/40`}
          style={{ boxShadow: `0 0 20px ${palette.ring}` }}
        />
      ) : (
        <div
          className={`relative w-full h-full ${s.rounded} overflow-hidden`}
          style={{
            background: `linear-gradient(135deg, ${palette.from} 0%, ${palette.to} 100%)`,
            boxShadow: `0 0 0 1px ${palette.ring}, 0 0 24px ${palette.ring}, inset 0 1px 0 rgba(255,255,255,0.15)`,
          }}
          aria-hidden="true"
        >
          {/* Brilho diagonal (efeito "vidro") */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'linear-gradient(135deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.05) 40%, transparent 60%)',
            }}
          />

          {/* Grelha subtil (cyber feel) */}
          <svg
            className="absolute inset-0 w-full h-full opacity-[0.12] pointer-events-none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <pattern id={`${ringId}-grid`} width="8" height="8" patternUnits="userSpaceOnUse">
                <path d="M 8 0 L 0 0 0 8" fill="none" stroke="white" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill={`url(#${ringId}-grid)`} />
          </svg>

          {/* Iniciais */}
          <span
            className={`absolute inset-0 flex items-center justify-center font-mono font-black tracking-wider ${s.text}`}
            style={{
              color: palette.text,
              textShadow: '0 1px 0 rgba(255,255,255,0.25)',
            }}
          >
            {initials}
          </span>

          {/* Borda interior sutil */}
          <div
            className={`absolute inset-0 ${s.rounded} pointer-events-none`}
            style={{ boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.15)' }}
          />
        </div>
      )}

      {online && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 ${s.dot} bg-[#00FF66] border-2 border-[#0B0E14] rounded-full`}
          aria-label="Online"
        >
          <span className="absolute inset-0 rounded-full bg-[#00FF66] animate-ping opacity-75" />
        </span>
      )}
    </div>
  );
};

export default Avatar;