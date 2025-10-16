'use client';

import { Grid, Flex, Badge, Icon } from '@tremor/react';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ClockIcon,
} from '@heroicons/react/24/solid';
import { formatDistanceToNow } from 'date-fns';

interface HealthMetrics {
  channel: string;
  lastWebhook: Date | null;
  last24hCount: number;
  errorCount: number;
  status: 'healthy' | 'warning' | 'error';
}

function getDataHealth(): {
  channels: HealthMetrics[];
  lastMvRefresh: Date | null;
} {
  const healthData: HealthMetrics[] = [
    {
      channel: 'shopify',
      lastWebhook: new Date(Date.now() - 2 * 60 * 60 * 1000),
      last24hCount: 145,
      errorCount: 0,
      status: 'healthy' as const,
    },
    {
      channel: 'square',
      lastWebhook: new Date(Date.now() - 30 * 60 * 1000),
      last24hCount: 89,
      errorCount: 2,
      status: 'warning' as const,
    },
    {
      channel: 'anyroad',
      lastWebhook: new Date(Date.now() - 5 * 60 * 60 * 1000),
      last24hCount: 12,
      errorCount: 0,
      status: 'healthy' as const,
    },
  ];

  return {
    channels: healthData,
    lastMvRefresh: new Date(Date.now() - 6 * 60 * 60 * 1000),
  };
}

export default function DataHealth() {
  const { channels, lastMvRefresh } = getDataHealth();

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return CheckCircleIcon;
      case 'warning':
        return ExclamationTriangleIcon;
      default:
        return ClockIcon;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'emerald';
      case 'warning':
        return 'amber';
      default:
        return 'gray';
    }
  };

  return (
    <div className="relative h-full overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6 transition-all hover:border-blue-500/30">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-transparent opacity-60"></div>
      
      <div className="relative h-full flex flex-col">
        <Flex justifyContent="between" alignItems="start" className="mb-5">
          <div>
            <h3 className="text-lg font-bold text-white tracking-tight">System Health</h3>
            <p className="mt-1.5 text-sm text-slate-400 font-medium">Data sync status</p>
          </div>
          <Badge color="cyan" size="sm" className="font-bold">
            {lastMvRefresh ? formatDistanceToNow(lastMvRefresh, { addSuffix: true }) : 'Never'}
          </Badge>
        </Flex>

        <div className="space-y-3">
          {channels.map((ch) => (
            <div 
              key={ch.channel}
              className="rounded-lg border border-white/10 bg-white/5 p-4 transition-all hover:bg-white/10 hover:border-white/20"
            >
              <Flex justifyContent="between" alignItems="start" className="gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Icon
                    icon={getStatusIcon(ch.status)}
                    color={getStatusColor(ch.status)}
                    size="sm"
                    className="flex-shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold capitalize text-white truncate">{ch.channel}</p>
                    <p className="text-xs text-slate-400 truncate">{ch.last24hCount} txns · {ch.lastWebhook ? formatDistanceToNow(ch.lastWebhook, { addSuffix: true }) : 'No data'}</p>
                  </div>
                </div>
                {ch.errorCount > 0 && (
                  <Badge color="red" size="xs" className="flex-shrink-0">
                    {ch.errorCount}
                  </Badge>
                )}
              </Flex>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
