import * as React from 'react';
import * as RechartsPrimitive from 'recharts';
import type { TooltipPayloadEntry } from 'recharts';

import { cn } from '../../lib/utils';

export type ChartConfig = Record<string, { label?: React.ReactNode; color?: string }>;

const ChartContext = React.createContext<{ config: ChartConfig } | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);
  if (!context) {
    throw new Error('useChart must be used within a <ChartContainer />');
  }
  return context;
}

function ChartStyle({ id, config }: { id: string; config: ChartConfig }) {
  const colors = Object.entries(config).filter(([, item]) => item.color);
  if (!colors.length) return null;
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `[data-chart=${id}] {\n${colors
          .map(([key, item]) => `  --color-${key}: ${item.color};`)
          .join('\n')}\n}`,
      }}
    />
  );
}

function ChartContainer({
  id,
  className,
  children,
  config,
  initialHeight = 200,
  ...props
}: React.ComponentProps<'div'> & {
  config: ChartConfig;
  initialHeight?: number;
  children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>['children'];
}) {
  const uniqueId = React.useId();
  const chartId = `chart-${id || uniqueId.replace(/:/g, '')}`;

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-slot="chart"
        data-chart={chartId}
        className={cn(
          "flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-hidden [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border [&_.recharts-sector]:outline-hidden [&_.recharts-surface]:outline-hidden",
          className
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer
          initialDimension={{ width: 1, height: initialHeight }}
        >
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

const ChartTooltip = RechartsPrimitive.Tooltip;

interface ChartTooltipContentProps {
  active?: boolean;
  payload?: ReadonlyArray<TooltipPayloadEntry>;
  label?: React.ReactNode;
  className?: string;
  hideLabel?: boolean;
  indicator?: 'dot' | 'line';
  valueFormatter?: (value: number, key: string) => React.ReactNode;
}

function ChartTooltipContent({
  active,
  payload,
  label,
  className,
  hideLabel = false,
  indicator = 'dot',
  valueFormatter,
}: ChartTooltipContentProps) {
  const { config } = useChart();
  const items = (payload ?? []).filter((item) => item.type !== 'none');
  if (!active || items.length === 0) return null;

  return (
    <div
      className={cn(
        'grid min-w-32 items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-1 duration-200 ease-out motion-reduce:animate-none',
        className
      )}
    >
      {!hideLabel && label !== undefined && <div className="font-medium">{label}</div>}
      <div className="grid gap-1.5">
        {items.map((item) => {
          const key = String(item.dataKey ?? item.name ?? 'value');
          const itemConfig = config[key];
          const color = item.color ?? item.stroke ?? itemConfig?.color;
          const value = typeof item.value === 'number' ? item.value : null;
          return (
            <div key={key} className="flex w-full items-center gap-2">
              <div
                className={cn(
                  'shrink-0 rounded-[2px]',
                  indicator === 'dot' ? 'size-2.5' : 'h-2.5 w-1'
                )}
                style={{ backgroundColor: color }}
              />
              <span className="text-muted-foreground">{itemConfig?.label ?? item.name}</span>
              <span className="ml-auto pl-3 font-mono font-medium tabular-nums text-foreground">
                {value === null ? '–' : valueFormatter ? valueFormatter(value, key) : value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { ChartContainer, ChartTooltip, ChartTooltipContent };
