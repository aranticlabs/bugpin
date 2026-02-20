import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { licenseApi } from '../../api/license';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Badge } from '../../components/ui/badge';
import { Spinner } from '../../components/ui/spinner';
import { Crown, Check, ExternalLink, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../../components/ui/alert-dialog';

export function LicenseSettings() {
  const queryClient = useQueryClient();
  const [licenseKey, setLicenseKey] = useState('');

  const { data: status, isLoading } = useQuery({
    queryKey: ['license-status'],
    queryFn: licenseApi.getStatus,
  });

  const activateMutation = useMutation({
    mutationFn: licenseApi.activate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['license-status'] });
      queryClient.invalidateQueries({ queryKey: ['license-features'] });
      toast.success('License activated successfully');
      setLicenseKey('');
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to activate license');
    },
  });

  const removeMutation = useMutation({
    mutationFn: licenseApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['license-status'] });
      queryClient.invalidateQueries({ queryKey: ['license-features'] });
      toast.success('License removed');
    },
    onError: () => {
      toast.error('Failed to remove license');
    },
  });

  const handleActivate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!licenseKey.trim()) {
      toast.error('Please enter a license key');
      return;
    }
    activateMutation.mutate(licenseKey.trim());
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12">
          <Spinner className="mx-auto text-primary" />
        </CardContent>
      </Card>
    );
  }

  const isLicensed = status?.licensed ?? false;
  const daysRemaining = status?.expiresAt
    ? Math.ceil((new Date(status.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : 0;

  return (
    <div className="space-y-6">
      {/* Current License Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5" />
            License Status
          </CardTitle>
          <CardDescription>
            {isLicensed
              ? 'Your Enterprise license is active'
              : 'Enter your license key to unlock Enterprise features'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLicensed ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="default" className="bg-green-600">
                  <Check className="h-3 w-3 mr-1" />
                  Licensed
                </Badge>
                <Badge variant="outline">{status?.plan}</Badge>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Customer</p>
                  <p className="font-medium">{status?.customerName || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Expires</p>
                  <p className="font-medium">
                    {status?.expiresAt ? new Date(status.expiresAt).toLocaleDateString() : 'Never'}
                    {daysRemaining > 0 && daysRemaining <= 30 && (
                      <span className="text-orange-500 ml-2">({daysRemaining} days left)</span>
                    )}
                  </p>
                </div>
              </div>

              {/* Licensed Features */}
              {status?.features && status.features.length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Licensed Features</p>
                  <div className="flex flex-wrap gap-2">
                    {status.features.map((feature) => (
                      <Badge key={feature} variant="secondary">
                        {feature.replace('-', ' ')}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Remove License */}
              <div className="pt-4 border-t">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Remove License
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove License?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will remove your Enterprise license. All EE features will be disabled
                        until you enter a new license key.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => removeMutation.mutate()}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Remove
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ) : (
            <form onSubmit={handleActivate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="license-key">License Key</Label>
                <Textarea
                  id="license-key"
                  placeholder="Paste your license key here..."
                  value={licenseKey}
                  onChange={(e) => setLicenseKey(e.target.value)}
                  rows={4}
                  className="font-mono text-sm"
                />
              </div>
              <div className="flex items-center gap-4">
                <Button type="submit" disabled={activateMutation.isPending}>
                  {activateMutation.isPending && <Spinner size="sm" className="mr-2" />}
                  Activate License
                </Button>
                <a
                  href="https://bugpin.io/editions/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline flex items-center gap-1"
                >
                  Get a license
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
