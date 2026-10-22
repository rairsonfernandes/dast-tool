import React, { useEffect, useState } from 'react';

interface LineChartProps { data: number[]; labels?: string[]; height?: number; color?: string; }

const LineChart: React.FC<LineChartProps> = ({ data, labels = [], height = 160, color = '#00FF66' }) => {
  const [path, setPath] = useState('');
  const [areaPath, setAreaPath] = useState('');
  const w = 100;
  const max = Math.max(...data, 1);

  useEffect(() => {
    const points = data.map((v, i) => {
      const x = (i / (data.length - 1 || 1)) * w;
      const y = 100 - (v / max) * 90 - 5;
      return [x, y];
    });
    const d = points.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
    setPath(d);
    setAreaPath(`${d} L${w},100 L0,100 Z`);
  }, [data, max]);

  return (
    <div className="w-full" style={{ height }}>
      <svg viewBox={`0 0 ${w} 100`} preserveAspectRatio="none" className="w-full h-full overflow-visible">
        <defs>
          <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 25, 50, 75, 100].map(y => <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="#1A2130" strokeWidth="0.3" />)}
        <path d={areaPath} fill="url(#lineGrad)" />
        <path d={path} fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      </svg>
      {labels.length > 0 && (
        <div className="flex justify-between mt-2 text-[10px] font-mono text-gray-500">
          {labels.map((l, i) => <span key={i}>{l}</span>)}
        </div>
      )}
    </div>
  );
};

export default LineChart;
