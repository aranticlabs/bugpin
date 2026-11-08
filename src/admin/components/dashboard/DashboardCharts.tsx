import { useId } from 'react';
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '../ui/chart';
import { cn } from '../../lib/utils';

export type ChartTone =
  'chart-1' | 'chart-2' | 'chart-3' | 'chart-4' | 'chart-5' | 'muted-foreground';

// Literal class names so Tailwind generates every tone.
const TONE_BACKGROUND: Record<ChartTone, string> = {
  'chart-1': 'bg-chart-1',
  'chart-2': 'bg-chart-2',
  'chart-3': 'bg-chart-3',
  'chart-4': 'bg-chart-4',
  'chart-5': 'bg-chart-5',
  'muted-foreground': 'bg-muted-foreground',
};

const TONE_BORDER: Record<ChartTone, string> = {
  'chart-1': 'border-chart-1',
  'chart-2': 'border-chart-2',
  'chart-3': 'border-chart-3',
  'chart-4': 'border-chart-4',
  'chart-5': 'border-chart-5',
  'muted-foreground': 'border-muted-foreground',
};

export function toneBackground(tone: ChartTone): string {
  return TONE_BACKGROUND[tone];
}

const TREND_CHART_SIZES = {
  default: { className: 'h-55', px: 220 },
  compact: { className: 'h-50', px: 200 },
} as const;

export type TrendChartSize = keyof typeof TREND_CHART_SIZES;

export function trendChartHeightClass(size: TrendChartSize): string {
  return TREND_CHART_SIZES[size].className;
}

function formatCell(value: number | null, format?: (value: number) => string): string {
  if (value === null) return 'No data';
  return format ? format(value) : String(value);
}

export interface ChartSeries {
  label: string;
  tone: ChartTone;
  values: (number | null)[];
  area?: boolean;
  dashed?: boolean;
  format?: (value: number) => string;
}

function gradientId(base: string, key: string): string {
  return `${base.replace(/:/g, '')}-${key}`;
}

export interface MiniChartPoint {
  label: string;
  value: number | null;
}

/**
 * Small chart for a KPI card. Bars suit daily counts, a smooth line suits measures that change
 * continuously. The scale always starts at zero so small changes look small.
 */
export function MiniChart({
  points,
  kind,
  name,
  format,
  className,
}: {
  points: MiniChartPoint[];
  kind: 'bar' | 'line';
  name: string;
  format?: (value: number) => string;
  className?: string;
}) {
  const id = useId();
  const fill = gradientId(id, 'mini');
  const config: ChartConfig = { value: { label: name, color: 'var(--chart-1)' } };
  const table = (
    <table className="sr-only">
      <caption>{name}</caption>
      <tbody>
        {points.map((point) => (
          <tr key={point.label}>
            <th scope="row">{point.label}</th>
            <td>{formatCell(point.value, format)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  const tooltip = (
    <ChartTooltip
      isAnimationActive={false}
      cursor={kind === 'bar' ? false : { strokeDasharray: '3 3' }}
      allowEscapeViewBox={{ x: false, y: true }}
      content={<ChartTooltipContent valueFormatter={(value) => (format ? format(value) : value)} />}
    />
  );
  // Each day is a full-height slot: the value from the bottom, a muted remainder above it, so
  // days without reports still show an empty slot.
  const slotMax = Math.max(1, ...points.map((point) => point.value ?? 0));
  const slotted = points.map((point) => ({ ...point, rest: slotMax - (point.value ?? 0) }));
  return (
    <ChartContainer
      config={config}
      initialHeight={40}
      title={name}
      dataTable={table}
      className={cn('aspect-auto h-10 w-full', className)}
    >
      {kind === 'bar' ? (
        <BarChart
          data={slotted}
          margin={{ top: 2, right: 0, bottom: 0, left: 0 }}
          barCategoryGap={2}
        >
          <XAxis dataKey="label" hide />
          <YAxis hide domain={[0, slotMax]} />
          {tooltip}
          <Bar
            dataKey="value"
            stackId="day"
            fill="var(--color-value)"
            maxBarSize={14}
            isAnimationActive={false}
          />
          <Bar
            dataKey="rest"
            stackId="day"
            fill="var(--muted)"
            radius={[2, 2, 0, 0]}
            maxBarSize={14}
            tooltipType="none"
            activeBar={false}
            isAnimationActive={false}
          />
        </BarChart>
      ) : (
        <ComposedChart data={points} margin={{ top: 4, right: 2, bottom: 0, left: 2 }}>
          <defs>
            <linearGradient id={fill} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-value)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="var(--color-value)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis dataKey="label" hide />
          <YAxis hide domain={[0, (max: number) => Math.max(1, max)]} />
          {tooltip}
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--color-value)"
            strokeWidth={1.5}
            fill={`url(#${fill})`}
            dot={false}
            activeDot={{ r: 3 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      )}
    </ChartContainer>
  );
}

export function TrendChart({
  title,
  labels,
  series,
  size = 'default',
}: {
  title: string;
  labels: string[];
  series: ChartSeries[];
  size?: TrendChartSize;
}) {
  const id = useId();
  const keys = series.map((_, index) => `s${index}`);
  const config: ChartConfig = Object.fromEntries(
    series.map((item, index) => [keys[index], { label: item.label, color: `var(--${item.tone})` }])
  );
  const table = (
    <table className="sr-only">
      <caption>{title}</caption>
      <thead>
        <tr>
          <th scope="col">Period</th>
          {series.map((item) => (
            <th key={item.label} scope="col">
              {item.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {labels.map((label, row) => (
          <tr key={label}>
            <th scope="row">{label}</th>
            {series.map((item) => (
              <td key={item.label}>{formatCell(item.values[row], item.format)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
  const data = labels.map((label, row) => ({
    label,
    ...Object.fromEntries(series.map((item, index) => [keys[index], item.values[row]])),
  }));
  const formatters = Object.fromEntries(series.map((item, index) => [keys[index], item.format]));

  return (
    <ChartContainer
      config={config}
      initialHeight={TREND_CHART_SIZES[size].px}
      title={title}
      dataTable={table}
      className={cn('aspect-auto w-full min-w-0', TREND_CHART_SIZES[size].className)}
    >
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          {series.map((item, index) =>
            item.area ? (
              <linearGradient
                key={keys[index]}
                id={gradientId(id, keys[index])}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={`var(--color-${keys[index]})`} stopOpacity={0.3} />
                <stop offset="100%" stopColor={`var(--color-${keys[index]})`} stopOpacity={0.02} />
              </linearGradient>
            ) : null
          )}
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
        <YAxis width={32} tickLine={false} axisLine={false} allowDecimals={false} tickCount={4} />
        <ChartTooltip
          isAnimationActive={false}
          cursor={{ strokeDasharray: '3 3' }}
          content={
            <ChartTooltipContent
              valueFormatter={(value, key) => formatters[key]?.(value) ?? value}
            />
          }
        />
        {series.map((item, index) =>
          item.area ? (
            <Area
              key={keys[index]}
              type="monotone"
              dataKey={keys[index]}
              stroke={`var(--color-${keys[index]})`}
              strokeWidth={2}
              strokeDasharray={item.dashed ? '5 4' : undefined}
              fill={`url(#${gradientId(id, keys[index])})`}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          ) : (
            <Line
              key={keys[index]}
              type="monotone"
              dataKey={keys[index]}
              stroke={`var(--color-${keys[index]})`}
              strokeWidth={2}
              strokeDasharray={item.dashed ? '5 4' : undefined}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          )
        )}
      </ComposedChart>
    </ChartContainer>
  );
}

export function SeriesLegend({
  series,
}: {
  series: Pick<ChartSeries, 'label' | 'tone' | 'dashed'>[];
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"
      aria-hidden
    >
      {series.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5">
          {item.dashed ? (
            <span className={cn('w-3 border-t-2 border-dashed', TONE_BORDER[item.tone])} />
          ) : (
            <span className={cn('size-2 rounded-full', TONE_BACKGROUND[item.tone])} />
          )}
          {item.label}
        </span>
      ))}
    </div>
  );
}
