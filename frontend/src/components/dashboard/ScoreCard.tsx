import React, { useEffect, useState } from 'react';

interface ScoreCardProps { score: number; label?: string; status?: string; }

const ScoreCard: React.FC<ScoreCardProps> = ({ score, label = '/ 100', status = 'SAUDÁVEL' }) => {
  const [offset, setOffset] = useState(251.2);
  const circumference = 251.2;
  const target = circumference - (score / 100) * circumference;

  useEffect(() => {
    const t = setTimeout(() => setOffset(target), 200);
    return () => clearTimeout(t);
  }, [target]);

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative w-44 h-44 flex items-center justify-center">
        <svg className="w-full h-full" viewBox="0 0 100 100">
          <circle stroke="#1A2130" strokeWidth={8} fill="transparent" r={40} cx={50} cy={50} />
          <circle className="text-[#00FF66] opacity-20" strokeWidth={12} stroke="currentColor" fill="transparent" r={40} cx={50} cy={50} strokeDasharray={circumference} strokeDashoffset={0} />
          <circle className="text-[#00FF66] gauge-circle" strokeWidth={8} stroke="currentColor" fill="transparent" r={40} cx={50} cy={50} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-5xl font-black font-mono text-white tracking-tighter">{score}</span>
          <span className="text-xs font-mono text-[#00FF66] font-bold border-t border-[#1A2130] pt-1 px-3 mt-0.5">{label}</span>
        </div>
      </div>
      {status && (
        <div className="mt-3 px-4 py-1.5 rounded-full bg-[#00FF66]/10 border border-[#00FF66]/40 text-[#00FF66] text-xs font-mono font-bold tracking-widest flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#00FF66] animate-pulse" /> {status}
        </div>
      )}
    </div>
  );
};

export default ScoreCard;
