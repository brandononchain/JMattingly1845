'use client';

import { Card, AreaChart } from '@tremor/react';

interface SalesChartProps {
  data: Array<{ date: string; sales: number }>;
  title: string;
}

export default function SalesChart({ data, title }: SalesChartProps) {
  const valueFormatter = (number: number) => 
    `$${Intl.NumberFormat('us').format(number).toString()}`;

  const maxSales = Math.max(...data.map(d => d.sales));
  const avgSales = data.reduce((sum, d) => sum + d.sales, 0) / data.length;

  return (
    <div className="group relative h-full overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6 transition-all hover:border-emerald-500/30">
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-transparent opacity-60"></div>
      
      <div className="relative h-full flex flex-col">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-white tracking-tight">{title}</h3>
            <p className="mt-1.5 text-sm text-slate-400 font-medium">14-day performance</p>
          </div>
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5">
            <p className="text-xs font-bold text-emerald-300">
              Peak: {valueFormatter(maxSales)}
            </p>
          </div>
        </div>
        
        <div className="flex-1 min-h-0 -mx-2">
          <AreaChart
            className="h-full [&_.recharts-cartesian-axis-tick-value]:fill-slate-400 [&_.recharts-cartesian-axis-tick-value]:text-xs [&_.recharts-cartesian-grid-horizontal_line]:stroke-slate-800/30 [&_.recharts-cartesian-grid-vertical_line]:stroke-slate-800/30 [&_.recharts-area]:fill-emerald-500/20 [&_.recharts-area]:stroke-emerald-400 [&_.recharts-area]:stroke-width-2 [&_.recharts-tooltip-wrapper]:z-50 [&_.recharts-tooltip]:bg-slate-900 [&_.recharts-tooltip]:border-slate-700 [&_.recharts-tooltip]:rounded-lg [&_.recharts-tooltip]:shadow-xl [&_.recharts-tooltip]:p-3 [&_.recharts-tooltip]:text-sm [&_.recharts-tooltip-label]:text-slate-300 [&_.recharts-tooltip-label]:font-semibold [&_.recharts-tooltip-label]:mb-2 [&_.recharts-tooltip-item]:text-white [&_.recharts-tooltip-item]:font-medium [&_.recharts-tooltip-item]:flex [&_.recharts-tooltip-item]:items-center [&_.recharts-tooltip-item]:gap-2 [&_.recharts-tooltip-item]:py-1"
            data={data}
            index="date"
            categories={['sales']}
            colors={['emerald']}
            valueFormatter={valueFormatter}
            yAxisWidth={80}
            showAnimation={true}
            showLegend={false}
            showGridLines={true}
            showXAxis={true}
            showYAxis={true}
            curveType="natural"
          />
        </div>
      </div>
    </div>
  );
}
