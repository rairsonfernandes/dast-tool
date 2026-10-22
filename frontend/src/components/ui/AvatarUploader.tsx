import React, { useCallback, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/layouts/DashboardLayout';
import Avatar from './Avatar';
import type { User } from '@/lib/auth';

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

interface AvatarUploaderProps {
  user: User | null;
  onUpdated: (u: User) => void;
}

const AvatarUploader: React.FC<AvatarUploaderProps> = ({ user, onUpdated }) => {
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const displayName =
    user?.name?.trim() || user?.email?.split('@')[0] || 'Utilizador';

  const hasAvatar = !!(user?.avatar || user?.avatar_url);

  const pickFile = () => inputRef.current?.click();

  const validate = (file: File): string | null => {
    if (!ALLOWED.includes(file.type)) return 'Formato inválido. Usa JPG, PNG ou WEBP.';
    if (file.size > MAX_BYTES) return 'Imagem demasiado grande (máx. 2 MB).';
    return null;
  };

  const handleFile = useCallback(
    async (file: File) => {
      const err = validate(file);
      if (err) {
        showToast(err, 'error');
        return;
      }
      setPreview(URL.createObjectURL(file));
      setUploading(true);
      try {
        const fd = new FormData();
        fd.append('file', file);
        const { data } = await api.post<User>('/api/auth/me/avatar', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        onUpdated(data);
        showToast('Foto atualizada.', 'success');
      } catch (e: any) {
        showToast(e?.response?.data?.error || 'Falha ao atualizar foto.', 'error');
        setPreview(null);
      } finally {
        setUploading(false);
      }
    },
    [onUpdated, showToast],
  );

  const handleRemove = async () => {
    if (!hasAvatar) return;
    setRemoving(true);
    try {
      const { data } = await api.delete<User>('/api/auth/me/avatar');
      onUpdated(data);
      setPreview(null);
      showToast('Foto removida.', 'success');
    } catch (e: any) {
      showToast(e?.response?.data?.error || 'Falha ao remover foto.', 'error');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="relative shrink-0">
      <Avatar
        name={displayName}
        src={preview || user?.avatar || user?.avatar_url || null}
        size="xl"
        online={true}
      />

      {(uploading || removing) && (
        <div className="absolute inset-0 rounded-2xl bg-black/70 flex items-center justify-center">
          <i className="fa-solid fa-spinner animate-spin text-[#00FF66]" />
        </div>
      )}

      <button
        type="button"
        onClick={pickFile}
        disabled={uploading || removing}
        title="Alterar foto"
        className="absolute -bottom-1 -right-1 w-8 h-8 rounded-lg bg-[#00FF66] text-black flex items-center justify-center shadow-[0_0_20px_rgba(0,255,102,0.3)] hover:bg-[#00E676] transition-all disabled:opacity-50"
      >
        <i className="fa-solid fa-camera text-xs" />
      </button>

      {hasAvatar && !uploading && (
        <button
          type="button"
          onClick={handleRemove}
          disabled={removing}
          title="Remover foto"
          className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-[#FF2E54] text-white flex items-center justify-center shadow hover:bg-red-600 transition-all disabled:opacity-50"
        >
          <i className="fa-solid fa-xmark text-[10px]" />
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED.join(',')}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = '';
        }}
      />
    </div>
  );
};

export default AvatarUploader;