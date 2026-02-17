import { useState } from 'react';
import { toast } from 'sonner';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Alert, AlertDescription } from '../ui/alert';
import { Plus, X, AlertCircle, Globe } from 'lucide-react';

interface ProjectWhitelistFormProps {
  value: string[];
  onChange: (origins: string[]) => void;
  disabled?: boolean;
  showCustomToggle?: boolean;
  useCustomSettings?: boolean;
  onCustomToggle?: (enabled: boolean) => void;
}

export function ProjectWhitelistForm({
  value,
  onChange,
  disabled = false,
  showCustomToggle = false,
  useCustomSettings = true,
  onCustomToggle,
}: ProjectWhitelistFormProps) {
  const [newOrigin, setNewOrigin] = useState('');

  const handleAddOrigin = () => {
    const trimmed = newOrigin.trim();
    if (!trimmed) return;

    // Basic domain validation (allows domains, localhost, and IP addresses)
    const domainRegex = /^([a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+\.[a-zA-Z]{2,}$/; // Standard domains
    const localhostRegex = /^localhost(:\d+)?$/; // localhost with optional port
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/; // IP address with optional port

    if (!domainRegex.test(trimmed) && !localhostRegex.test(trimmed) && !ipRegex.test(trimmed)) {
      toast.error('Please enter a valid domain (e.g., example.com, localhost, or 127.0.0.1)');
      return;
    }

    if (value.includes(trimmed)) {
      toast.error('This origin is already in the list');
      return;
    }

    onChange([...value, trimmed]);
    setNewOrigin('');
  };

  const handleRemoveOrigin = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      {/* Use Custom Whitelist Toggle */}
      {showCustomToggle && (
        <div className="flex items-center justify-between pb-3 border-b">
          <div className="space-y-0.5">
            <Label htmlFor="use-custom-whitelist" className="text-sm font-medium">
              Use Custom Domain Whitelist
            </Label>
            <p className="text-xs text-muted-foreground">
              Configure allowed domains specifically for this project
            </p>
          </div>
          <Switch
            id="use-custom-whitelist"
            checked={useCustomSettings}
            onCheckedChange={(checked) => {
              onCustomToggle?.(checked);
              if (!checked) {
                // Reset to empty when switching to global defaults
                onChange([]);
              }
            }}
          />
        </div>
      )}

      {/* Whitelist Settings - collapsed when custom toggle is off */}
      {(!showCustomToggle || useCustomSettings) && (
        <>
          {/* Info Alert */}
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Origin Whitelist:</strong> Only websites from allowed domains can use your
              project's widget. Leave empty to allow all origins (not recommended for production).
            </AlertDescription>
          </Alert>

          {/* Origins List */}
          <div className="space-y-3">
            <Label>Allowed Origins ({value.length})</Label>

            {value.length > 0 ? (
              <div className="space-y-2">
                {value.map((origin, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 p-2 border rounded-lg bg-muted/50"
                  >
                    <Globe className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="flex-1 text-sm font-mono">{origin}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveOrigin(index)}
                      className="h-7 w-7 p-0"
                      disabled={disabled}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Warning:</strong> No origins configured. The widget can be used from any
                  website.
                </AlertDescription>
              </Alert>
            )}

            {/* Add New Origin */}
            <div className="flex gap-2">
              <Input
                placeholder="example.com"
                value={newOrigin}
                onChange={(e) => setNewOrigin(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddOrigin();
                  }
                }}
                disabled={disabled}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={handleAddOrigin}
                disabled={disabled}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Enter domains without protocol (e.g., "example.com", "localhost", or "127.0.0.1")
            </p>
          </div>
        </>
      )}
    </div>
  );
}
