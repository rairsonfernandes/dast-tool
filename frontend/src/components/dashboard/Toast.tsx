import React from 'react';

interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info';
}

const Toast: React.FC<ToastProps> = ({ message, type }) => {
  const icons = {
    success: <i className="fa-solid fa-circle-check text-[#00FF66]" />,
    error: <i className="fa-solid fa-circle-xmark text-[#FF2E54]" />,
    info: <i className="fa-solid fa-circle-info text-[#00B0FF]" />,
  };
  const borders = {
    success: 'border-[#00FF66]/50',
    error: 'border-[#FF2E54]/50',
    info: 'border-[#00B0FF]/50',
  };
  return (
    <div
      className={`bg-[#0B0E14] border ${borders[type]} text-white font-mono text-xs px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 max-w-sm animate-[dropdownIn_0.2s_ease-out]`}
    >
      {icons[type]} <span>{message}</span>
    </div>
  );
};

export default Toast;