import { createContext, useContext, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Info } from 'lucide-react';
import { Alert, AlertDescription } from '../../ui/alert';
import { Badge } from '../../ui/badge';
import { Label } from '../../ui/label';
import { Switch } from '../../ui/switch';

export const AutoSaveContext = createContext<() => void>(() => undefined);

export function CustomSwitch({
  id,
  label,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const requestSave = useContext(AutoSaveContext);
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Label htmlFor={id} className="text-sm font-normal text-muted-foreground">
        Custom
      </Label>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={(next) => {
          onCheckedChange(next);
          if (!next) requestSave();
        }}
        aria-label={label}
      />
    </div>
  );
}

export function InheritedBadge() {
  return (
    // The negative margin keeps the badge inside the title's line height, so the header does not
    // grow when the badge appears.
    <Badge size="sm" className="-my-0.5 px-2 font-medium">
      Inherited
    </Badge>
  );
}

export function InheritedFields({
  custom,
  defaultsPath,
  children,
}: {
  custom: boolean;
  defaultsPath?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      {!custom && (
        <Alert role="note" className="border-primary/20 bg-primary/10">
          <Info className="h-4 w-4" />
          <AlertDescription>
            Inherits the project defaults. Turn on Custom to change them for this project.
            {defaultsPath && (
              <>
                {' '}
                <Link to={defaultsPath} className="underline">
                  Edit project defaults
                </Link>
              </>
            )}
          </AlertDescription>
        </Alert>
      )}
      <div className="space-y-4">{children}</div>
    </div>
  );
}
