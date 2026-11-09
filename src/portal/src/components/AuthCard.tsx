import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@shared-ui/components/ui/card';

export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="mx-auto w-full min-w-0 max-w-md">
      <CardHeader>
        <CardTitle>
          <h1 className="text-xl leading-snug">{title}</h1>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 break-words">{children}</CardContent>
    </Card>
  );
}
