'use client';

import { AreaChart } from '@tremor/react';
import { SignalIcon } from '@heroicons/react/24/outline';

interface WebsiteTrafficProps {
  data: Array<{ date: string; visitors: number; pageViews: number }>;
}

export default function WebsiteTraffic({ data }: WebsiteTrafficProps) {
  const valueFormatter = (number: number) => 
    `${Intl.NumberFormat('us').format(number).toString()}`;

  const totalVisitors = data.reduce((sum, d) => sum + d.visitors, 0);
  const totalPageViews = data.reduce((sum, d) => sum + d.pageViews, 0);
  const avgVisitors = Math.round(totalVisitors / data.length);

  return (
    <div className="relative h-full overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
      <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 via-transparent to-emerald-500/5 opacity-50"></div>
      
      <div className="relative h-full flex flex-col">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-gradient-to-br from-green-400 to-emerald-500 p-2.5">
                <SignalIcon className="h-5 w-5 text-white" strokeWidth={2} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Website Traffic</h3>
                <p className="text-sm text-slate-400">Visitor analytics</p>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3">
              <p className="text-xs font-medium text-emerald-300">Avg Daily</p>
              <p className="mt-1 text-xl font-bold text-white">{avgVisitors.toLocaleString()}</p>
            </div>
            <div className="rounded-lg border border-green-500/20 bg-green-500/10 p-3">
              <p className="text-xs font-medium text-green-300">Page Views</p>
              <p className="mt-1 text-xl font-bold text-white">{totalPageViews.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 -mx-2">
          <AreaChart
            className="h-full [&_.recharts-cartesian-axis-tick-value]:fill-slate-400 [&_.recharts-cartesian-axis-tick-value]:text-xs [&_.recharts-cartesian-grid-horizontal_line]:stroke-slate-800/30 [&_.recharts-cartesian-grid-vertical_line]:stroke-slate-800/30 [&_.recharts-area]:fill-emerald-500/20 [&_.recharts-area]:stroke-emerald-400 [&_.recharts-area]:stroke-width-2 [&_.recharts-tooltip-wrapper]:z-50 [&_.recharts-tooltip]:bg-slate-900 [&_.recharts-tooltip]:border-slate-700 [&_.recharts-tooltip]:rounded-lg [&_.recharts-tooltip]:shadow-xl [&_.recharts-tooltip]:p-3 [&_.recharts-tooltip]:text-sm [&_.recharts-tooltip-label]:text-slate-300 [&_.recharts-tooltip-label]:font-semibold [&_.recharts-tooltip-label]:mb-2 [&_.recharts-tooltip-item]:text-white [&_.recharts-tooltip-item]:font-medium [&_.recharts-tooltip-item]:flex [&_.recharts-tooltip-item]:items-center [&_.recharts-tooltip-item]:gap-2 [&_.recharts-tooltip-item]:py-1"
            data={data}
            index="date"
            categories={['visitors']}
            colors={['emerald']}
            valueFormatter={valueFormatter}
            yAxisWidth={50}
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

