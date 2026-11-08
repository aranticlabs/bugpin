import { useState, useRef, useCallback, useEffect } from 'react';
import { ImageUploadTile } from '../ImageUploadTile';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { SettingsCard } from '../ui/settings-card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Slider } from '../ui/slider';
import { SettingRow, SettingRows } from '../ui/setting-row';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Badge } from '../ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../ui/dialog';
import { Upload, Trash2 } from 'lucide-react';
import { Spinner } from '../ui/spinner';
import { getCroppedImg } from '../../lib/imageUtils';
import { UnsavedChangesGuard } from '../UnsavedChangesGuard';
import { submitForm } from '../../lib/submitForm';
import { apiErrorCode, apiErrorMessage } from '../../lib/apiError';
import type { User } from '@shared/types';

export function AccountCard() {
  const { user } = useAuth();

  return (
    <SettingsCard title="Account" description="Your profile picture, name and email address.">
      <div className="space-y-6">
        <ProfileSection user={user} />
        <UpdateProfileSection key={user?.id || 'no-user'} user={user} />
      </div>
    </SettingsCard>
  );
}

function ProfileSection({ user }: { user: User | null }) {
  const { refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cropping state
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [originalFile, setOriginalFile] = useState<File | null>(null);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const response = await api.post('/users/me/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data;
    },
    onSuccess: async () => {
      await refreshUser();
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Avatar updated successfully');
      setUploading(false);
      setIsDialogOpen(false);
    },
    onError: (err) => {
      toast.error(apiErrorMessage(err, 'Failed to upload avatar'));
      setUploading(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const response = await api.delete('/users/me/avatar');
      return response.data;
    },
    onSuccess: async () => {
      await refreshUser();
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Avatar removed successfully');
      setIsDialogOpen(false);
    },
    onError: (err) => {
      toast.error(apiErrorMessage(err, 'Failed to remove avatar'));
    },
  });

  useEffect(() => {
    if (!imageToCrop) return;
    return () => URL.revokeObjectURL(imageToCrop);
  }, [imageToCrop]);

  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Only JPEG, PNG, WebP, and GIF images are allowed');
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }

    // Square images upload directly, others open the crop dialog
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      if (img.width === img.height) {
        URL.revokeObjectURL(objectUrl);
        setUploading(true);
        uploadMutation.mutate(file);
      } else {
        setOriginalFile(file);
        setImageToCrop(objectUrl);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      toast.error('Could not read the image. Choose another file.');
    };

    img.src = objectUrl;

    // Reset input
    if (e.target) {
      e.target.value = '';
    }
  };

  const handleCropSave = async () => {
    if (!imageToCrop || !croppedAreaPixels || !originalFile) return;

    try {
      setUploading(true);
      const croppedBlob = await getCroppedImg(imageToCrop, croppedAreaPixels);
      const croppedFile = new File([croppedBlob], originalFile.name, { type: 'image/jpeg' });

      setImageToCrop(null);
      setOriginalFile(null);
      setCrop({ x: 0, y: 0 });
      setZoom(1);

      // Upload cropped image
      uploadMutation.mutate(croppedFile);
    } catch {
      toast.error('Failed to crop image');
      setUploading(false);
    }
  };

  const handleCropCancel = () => {
    setImageToCrop(null);
    setOriginalFile(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  };

  return (
    <>
      <div className="flex items-center gap-4">
        <ImageUploadTile
          label="Change profile picture"
          onActivate={() => setIsDialogOpen(true)}
          shape="circle"
        >
          <Avatar className="h-16 w-16" key={user?.avatarUrl || 'no-avatar'}>
            {user?.avatarUrl && user.avatarUrl.trim() !== '' ? (
              <AvatarImage src={user.avatarUrl} alt={user?.name || 'User'} />
            ) : (
              <AvatarFallback className="bg-brand-subtle text-brand-subtle-foreground text-2xl">
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </AvatarFallback>
            )}
          </Avatar>
        </ImageUploadTile>
        <div>
          <p className="text-lg font-medium">{user?.name}</p>
          <p className="text-muted-foreground">{user?.email}</p>
          <Badge variant="secondary" className="mt-1 capitalize">
            {user?.role}
          </Badge>
        </div>
      </div>

      {/* Avatar Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Avatar</DialogTitle>
            <DialogDescription>Upload a new avatar or remove your current one</DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Current Avatar Preview */}
            <div className="flex justify-center">
              <Avatar className="h-32 w-32" key={user?.avatarUrl || 'no-avatar'}>
                {user?.avatarUrl && user.avatarUrl.trim() !== '' ? (
                  <AvatarImage src={user.avatarUrl} alt={user?.name || 'User'} />
                ) : (
                  <AvatarFallback className="bg-brand-subtle text-brand-subtle-foreground text-5xl">
                    {user?.name?.charAt(0).toUpperCase() || 'U'}
                  </AvatarFallback>
                )}
              </Avatar>
            </div>

            {/* Actions */}
            <div className="space-y-3">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
                className="hidden"
              />

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || uploadMutation.isPending}
              >
                {uploading ? (
                  <>
                    <Spinner size="sm" className="mr-2" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload New Avatar
                  </>
                )}
              </Button>

              {user?.avatarUrl && user.avatarUrl.trim() !== '' && (
                <Button
                  type="button"
                  variant="outline-destructive"
                  className="w-full"
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending || uploading}
                >
                  {deleteMutation.isPending ? (
                    <>
                      <Spinner size="sm" className="mr-2" />
                      Removing...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Remove Avatar
                    </>
                  )}
                </Button>
              )}

              <p className="text-xs text-center text-muted-foreground">
                Recommended: Square image, max 5MB
                <br />
                Supported formats: JPEG, PNG, WebP, GIF
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Crop Dialog */}
      <Dialog open={!!imageToCrop} onOpenChange={(open) => !open && handleCropCancel()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Crop Avatar</DialogTitle>
            <DialogDescription>Adjust the crop area to create a square avatar</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Cropper */}
            <div className="relative h-96 bg-muted rounded-lg overflow-hidden">
              {imageToCrop && (
                <Cropper
                  image={imageToCrop}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                />
              )}
            </div>

            <div className="space-y-3">
              <Label id="avatar-zoom-label">Zoom</Label>
              <Slider
                aria-labelledby="avatar-zoom-label"
                min={1}
                max={3}
                step={0.1}
                value={[zoom]}
                onValueChange={([next]) => setZoom(next)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCropCancel} disabled={uploading}>
              Cancel
            </Button>
            <Button type="button" onClick={handleCropSave} disabled={uploading}>
              {uploading ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Uploading...
                </>
              ) : (
                'Save & Upload'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const PASSWORD_REQUIRED_MESSAGE = 'Enter your current password to change your email address';
const PASSWORD_ERROR_CODES = new Set(['PASSWORD_REQUIRED', 'INVALID_PASSWORD']);

// Matches the server, which ignores surrounding spaces and letter case when comparing emails.
function isSameEmail(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function createProfileSchema(savedEmail: () => string) {
  return z
    .object({
      name: z.string().min(2, 'Name must be at least 2 characters'),
      email: z.string().min(1, 'Email is required').email('Please enter a valid email address'),
      currentPassword: z.string(),
    })
    .superRefine((data, ctx) => {
      if (!isSameEmail(data.email, savedEmail()) && !data.currentPassword) {
        ctx.addIssue({
          code: 'custom',
          path: ['currentPassword'],
          message: PASSWORD_REQUIRED_MESSAGE,
        });
      }
    });
}

type UpdateProfileFormData = z.infer<ReturnType<typeof createProfileSchema>>;

interface ProfileUpdate {
  name?: string;
  email?: string;
  currentPassword?: string;
}

function UpdateProfileSection({ user }: { user: User | null }) {
  const { refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const savedName = user?.name ?? '';
  const savedEmail = user?.email ?? '';
  const savedEmailRef = useRef(savedEmail);
  const [schema] = useState(() => createProfileSchema(() => savedEmailRef.current));

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setError,
    formState: { errors },
  } = useForm<UpdateProfileFormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: savedName, email: savedEmail, currentPassword: '' },
  });

  const watchedName = watch('name');
  const watchedEmail = watch('email');
  const emailChanged = !isSameEmail(watchedEmail, savedEmail);

  // Only a change of the saved name or email refreshes the fields, and edits in progress stay.
  useEffect(() => {
    savedEmailRef.current = savedEmail;
    reset({ name: savedName, email: savedEmail, currentPassword: '' }, { keepDirtyValues: true });
  }, [savedName, savedEmail, reset]);

  const mutation = useMutation({
    mutationFn: async (data: ProfileUpdate) => {
      const response = await api.patch('/users/me/profile', data);
      return response.data as { user?: User };
    },
    onSuccess: async (response) => {
      const updatedUser = response.user;
      if (updatedUser) {
        savedEmailRef.current = updatedUser.email;
        reset({ name: updatedUser.name, email: updatedUser.email, currentPassword: '' });
      }
      await refreshUser();
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Profile updated successfully');
    },
    onError: (err) => {
      const code = apiErrorCode(err);
      if (code && PASSWORD_ERROR_CODES.has(code)) {
        setError(
          'currentPassword',
          {
            message: apiErrorMessage(
              err,
              code === 'INVALID_PASSWORD' ? 'The password is incorrect' : PASSWORD_REQUIRED_MESSAGE
            ),
          },
          { shouldFocus: true }
        );
        return;
      }
      toast.error(apiErrorMessage(err, 'Failed to update profile'));
    },
  });

  const toUpdates = (data: UpdateProfileFormData): ProfileUpdate => {
    const updates: ProfileUpdate = {};
    if (data.name !== savedName) updates.name = data.name;
    if (!isSameEmail(data.email, savedEmail)) {
      updates.email = data.email;
      updates.currentPassword = data.currentPassword;
    }
    return updates;
  };

  const hasChanges = watchedName !== savedName || emailChanged;

  return (
    <div className="flex flex-1 flex-col">
      <UnsavedChangesGuard
        isDirty={hasChanges}
        onSave={() => submitForm(handleSubmit, (data) => mutation.mutateAsync(toUpdates(data)))}
        onDiscard={() => reset({ name: savedName, email: savedEmail, currentPassword: '' })}
      />
      <SettingRows>
        <SettingRow
          label={
            <>
              Name <span className="text-destructive">*</span>
            </>
          }
          htmlFor="profile-name"
          controlClassName="@sm:w-80"
        >
          <Input id="profile-name" type="text" {...register('name')} aria-invalid={!!errors.name} />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </SettingRow>
        <SettingRow
          label={
            <>
              Email Address <span className="text-destructive">*</span>
            </>
          }
          htmlFor="profile-email"
          description="Used to sign in and for notifications."
          controlClassName="@sm:w-80"
        >
          <Input
            id="profile-email"
            type="email"
            {...register('email')}
            aria-invalid={!!errors.email}
          />
          {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
        </SettingRow>
        {emailChanged && (
          <SettingRow
            label={
              <>
                Current password <span className="text-destructive">*</span>
              </>
            }
            htmlFor="profile-current-password"
            description="Confirms that you are changing your own email address."
            controlClassName="@sm:w-80"
          >
            <Input
              id="profile-current-password"
              type="password"
              autoComplete="current-password"
              {...register('currentPassword')}
              aria-invalid={!!errors.currentPassword}
              aria-describedby={
                errors.currentPassword ? 'profile-current-password-error' : undefined
              }
            />
            {errors.currentPassword && (
              <p id="profile-current-password-error" className="text-xs text-destructive">
                {errors.currentPassword.message}
              </p>
            )}
          </SettingRow>
        )}
      </SettingRows>
    </div>
  );
}
