import React from 'react';

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

const config: Record<Severity, { label: string; color: string; bg: string; border: string; dot: string }> = {
  CRITICAL: { label: 'CRÍTICO', color: 'text-[#FF2E54]', bg: 'bg-[#FF2E54]/15', border: 'border-[#FF2E54]/30', dot: 'bg-[#FF2E54]' },
  HIGH:     { label: 'ALTO',    color: 'text-[#FF8800]', bg: 'bg-[#FF8800]/15', border: 'border-[#FF8800]/30', dot: 'bg-[#FF8800]' },
  MEDIUM:   { label: 'MÉDIO',   color: 'text-[#FFC107]', bg: 'bg-[#FFC107]/15', border: 'border-[#FFC107]/30', dot: 'bg-[#FFC107]' },
  LOW:      { label: 'BAIXO',   color: 'text-[#00B0FF]', bg: 'bg-[#00B0FF]/15', border: 'border-[#00B0FF]/30', dot: 'bg-[#00B0FF]' },
  INFO:     { label: 'INFO',    color: 'text-gray-400',  bg: 'bg-gray-500/15',  border: 'border-gray-500/30',  dot: 'bg-gray-400' },  // ← NOVO
};

const SeverityBadge: React.FC<{ severity: Severity; className?: string }> = ({ severity, className = '' }) => {
  const c = config[severity];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md ${c.bg} ${c.color} ${c.border} border font-mono text-[10px] font-bold tracking-wider ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} /> {c.label}
    </span>
  );
};

export default SeverityBadge;