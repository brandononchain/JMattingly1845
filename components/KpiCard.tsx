'use client';

import { Card, Metric, Flex, BadgeDelta, DeltaType } from '@tremor/react';
import { ArrowTrendingUpIcon, ArrowTrendingDownIcon } from '@heroicons/react/24/outline';

interface KpiCardProps {
  title: string;
  value: number;
  format: 'currency' | 'number' | 'decimal';
  trend?: number;
  variant?: 'default' | 'large';
  isLoading?: boolean;
}

export default function KpiCard({ title, value, format, trend, variant = 'default', isLoading }: KpiCardProps) {
  const formatValue = (val: number, fmt: string) => {
    if (isLoading) return '—';
    if (val === undefined || val === null) return '—';
    
    switch (fmt) {
      case 'currency':
        return `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      case 'decimal':
        return val.toFixed(2);
      case 'number':
        return val.toLocaleString('en-US');
      default:
        return val.toString();
    }
  };

  const getDeltaType = (trendValue?: number): DeltaType => {
    if (!trendValue || trendValue === 0) return 'unchanged';
    if (trendValue > 0) return 'increase';
    return 'decrease';
  };

  const isLarge = variant === 'large';

  return (
    <div className={`group relative h-full overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl transition-all hover:bg-white/10 hover:border-white/20 ${isLarge ? 'p-7' : 'p-6'}`}>
      {/* Glow effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-transparent to-cyan-500/10 opacity-0 transition-opacity group-hover:opacity-100"></div>
      
      <div className="relative flex h-full flex-col justify-between">
        <div className="space-y-1">
          <p className={`font-semibold tracking-wide uppercase text-slate-400 ${isLarge ? 'text-sm' : 'text-xs'} leading-tight`}>
            {title}
          </p>
          
          <Metric className={`text-white font-extrabold tracking-tight leading-none ${isLarge ? 'mt-4 text-5xl' : 'mt-3 text-4xl'}`}>
            {formatValue(value, format)}
          </Metric>
        </div>
        
        {trend !== undefined && (
          <div className="mt-6 flex items-center gap-3">
            <div className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 ${
              trend > 0 ? 'bg-emerald-500/20 border border-emerald-500/30' : 'bg-red-500/20 border border-red-500/30'
            }`}>
              {trend > 0 ? (
                <ArrowTrendingUpIcon className="h-4 w-4 text-emerald-400" strokeWidth={2.5} />
              ) : (
                <ArrowTrendingDownIcon className="h-4 w-4 text-red-400" strokeWidth={2.5} />
              )}
              <span className={`text-sm font-bold ${
                trend > 0 ? 'text-emerald-300' : 'text-red-300'
              }`}>
                {trend > 0 ? '+' : ''}{trend.toFixed(1)}%
              </span>
            </div>
            <p className="text-xs font-medium text-slate-500 leading-tight">vs last period</p>
          </div>
        )}
      </div>
    </div>
  );
}
