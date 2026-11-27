import { expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';

it('opts into line tabs while keeping nested lists segmented by default', () => {
  render(
    <Tabs defaultValue="launcher">
      <TabsList variant="line" aria-label="Categories">
        <TabsTrigger value="launcher">Launcher Button</TabsTrigger>
      </TabsList>
      <TabsContent value="launcher">
        <Tabs defaultValue="general">
          <TabsList aria-label="Launcher settings">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="colors">Colors</TabsTrigger>
          </TabsList>
        </Tabs>
      </TabsContent>
    </Tabs>
  );

  const categories = screen.getByRole('tablist', { name: 'Categories' });
  expect(categories).toHaveClass('bg-transparent', 'shadow-[inset_0_-1px_0_var(--border)]');
  expect(categories).not.toHaveAttribute('variant');
  expect(screen.getByRole('tablist', { name: 'Launcher settings' })).toHaveClass(
    'bg-muted',
    'rounded-lg',
    'p-1'
  );
});
