import type { ReactNode } from 'react';
import { Card, CardContent } from '@shared-ui/components/ui/card';

export function AuthCard({
  title,
  description,
  footer,
  children,
}: {
  title: string;
  description?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 py-10">
      <div className="w-full min-w-0 max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="break-words text-2xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        <Card>
          <CardContent className="space-y-4 break-words pt-6">{children}</CardContent>
        </Card>
        {footer}
      </div>
    </div>
  );
}
