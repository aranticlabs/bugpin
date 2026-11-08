import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { Area } from 'react-easy-crop';
import { apiErrorMessage } from '../../lib/apiError';
import { cropImageToPng } from './cropImage';
import { toPngFileName, validateImageFile, type BrandMode, type ImageFileRules } from './imageFile';

interface PendingCrop {
  mode: BrandMode;
  file: File;
  url: string;
}

interface BrandImageUploadOptions {
  rules: ImageFileRules;
  upload: (mode: BrandMode, file: File) => Promise<unknown>;
  successMessage: string;
  errorMessage: string;
  /** Non-square images open a crop step before they are uploaded. */
  cropToSquare?: boolean;
  onUploaded?: () => void;
}

export function useBrandImageUpload({
  rules,
  upload,
  successMessage,
  errorMessage,
  cropToSquare = false,
  onUploaded,
}: BrandImageUploadOptions) {
  const queryClient = useQueryClient();
  const [pendingCrop, setPendingCrop] = useState<PendingCrop | null>(null);
  const [isCropping, setIsCropping] = useState(false);
  const pendingUrl = useRef<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (pendingUrl.current) URL.revokeObjectURL(pendingUrl.current);
      pendingUrl.current = null;
    };
  }, []);

  const mutation = useMutation({
    mutationFn: ({ mode, file }: { mode: BrandMode; file: File }) => upload(mode, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branding-config'] });
      toast.success(successMessage);
      onUploaded?.();
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, errorMessage));
    },
  });

  const clearCrop = () => {
    if (pendingUrl.current) URL.revokeObjectURL(pendingUrl.current);
    pendingUrl.current = null;
    setPendingCrop(null);
  };

  const selectFile = (file: File, mode: BrandMode) => {
    const error = validateImageFile(file, rules);
    if (error) {
      toast.error(error);
      return;
    }
    if (!cropToSquare) {
      mutation.mutate({ mode, file });
      return;
    }

    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      if (!mounted.current || image.width === image.height) {
        URL.revokeObjectURL(url);
        if (mounted.current) mutation.mutate({ mode, file });
        return;
      }
      if (pendingUrl.current) URL.revokeObjectURL(pendingUrl.current);
      pendingUrl.current = url;
      setPendingCrop({ mode, file, url });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      if (mounted.current) toast.error('Failed to load image');
    };
    image.src = url;
  };

  const saveCrop = async (area: Area) => {
    if (!pendingCrop) return;
    setIsCropping(true);
    try {
      const blob = await cropImageToPng(pendingCrop.url, area);
      const file = new File([blob], toPngFileName(pendingCrop.file.name), { type: 'image/png' });
      const { mode } = pendingCrop;
      clearCrop();
      mutation.mutate({ mode, file });
    } catch {
      toast.error('Failed to crop image');
    } finally {
      setIsCropping(false);
    }
  };

  return {
    selectFile,
    cropImage: pendingCrop?.url ?? null,
    saveCrop,
    cancelCrop: clearCrop,
    isUploading: isCropping || mutation.isPending,
  };
}
