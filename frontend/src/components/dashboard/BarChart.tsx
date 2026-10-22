import React, { useEffect, useState } from 'react';

interface BarChartProps {
  data: { label: string; value: number; color?: string }[];
  height?: number;
}

const BarChart: React.FC<BarChartProps> = ({ data, height = 160 }) => {
  const max = Math.max(...data.map((d) => d.value), 1);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="w-full flex items-end justify-between gap-2 sm:gap-3"
      style={{ height }}
    >
      {data.map((d, i) => {
        const h = (d.value / max) * 100;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-2">
            <div
              className="w-full flex items-end justify-center"
              style={{ height: height - 24 }}
            >
              <div
                className={`w-full max-w-[40px] rounded-t-md border ${
                  d.color ? '' : 'bg-[#00FF66]/60 border-[#00FF66]/30'
                }`}
                style={{
                  height: mounted ? `${h}%` : 0,
                  background: d.color,
                  borderColor: d.color ? `${d.color}50` : undefined,
                  transition: 'height 1s ease-out',
                  boxShadow: d.color ? `0 0 15px ${d.color}40` : undefined,
                }}
              />
            </div>
            <span className="text-[10px] font-mono text-gray-500">
              {d.label}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default BarChart;