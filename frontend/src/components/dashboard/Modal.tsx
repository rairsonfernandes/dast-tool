import React from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: string;
  iconColor?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
}

const Modal: React.FC<ModalProps> = ({ open, onClose, title, icon = 'fa-circle-question', iconColor = 'text-[#00FF66]', children, footer, maxWidth = 'max-w-md' }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-md">
      <div className={`cyber-card rounded-2xl p-6 ${maxWidth} w-full space-y-5 shadow-2xl border border-[#00FF66]/30`}>
        <div className="flex items-center justify-between pb-3 border-b border-[#1A2130]">
          <div className="flex items-center gap-2">
            <i className={`fa-solid ${icon} ${iconColor}`} />
            <h3 className="text-base font-bold text-white font-mono">{title}</h3>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1">
            <i className="fa-solid fa-xmark text-lg" />
          </button>
        </div>
        <div>{children}</div>
        {footer && <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#1A2130]">{footer}</div>}
      </div>
    </div>
  );
};

export default Modal;
