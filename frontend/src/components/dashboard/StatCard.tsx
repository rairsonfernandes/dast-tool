import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number | React.ReactNode;
  icon: string;
  iconColor?: string;
  trend?: string;
  trendColor?: string;
  trendIcon?: string;
  valueColor?: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, icon, iconColor = 'text-[#00FF66]', trend, trendColor = 'text-[#00FF66]', trendIcon, valueColor = 'text-white' }) => (
  <div className="cyber-card rounded-2xl p-5">
    <div className="flex items-center justify-between mb-3">
      <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">{label}</span>
      <div className={`w-8 h-8 rounded-lg bg-current/10 border border-current/20 flex items-center justify-center ${iconColor}`}>
        <i className={`fa-solid ${icon} text-sm`} />
      </div>
    </div>
    <div className={`text-3xl font-mono font-bold mb-1 ${valueColor}`}>{value}</div>
    {trend && (
      <div className={`text-[11px] flex items-center gap-1 font-mono ${trendColor}`}>
        {trendIcon && <i className={`fa-solid ${trendIcon}`} />} {trend}
      </div>
    )}
  </div>
);

export default StatCard;
