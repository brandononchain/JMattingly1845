'use client';

import { useState } from 'react';
import {
  Table,
  TableHead,
  TableRow,
  TableHeaderCell,
  TableBody,
  TableCell,
  Badge,
} from '@tremor/react';

interface TopItem {
  rank: number;
  sku: string;
  productTitle: string;
  category: string | null;
  revenue: number;
  qty: number;
}

interface TopItemsTableProps {
  items: TopItem[];
}

export default function TopItemsTable({ items }: TopItemsTableProps) {
  const [sortBy, setSortBy] = useState<'revenue' | 'units'>('revenue');

  const sortedItems = [...items].sort((a, b) => {
    if (sortBy === 'revenue') {
      return b.revenue - a.revenue;
    }
    return b.qty - a.qty;
  });

  const getCategoryColor = (category: string | null) => {
    if (!category) return 'gray';
    const colors: Record<string, any> = {
      'Bourbon': 'amber',
      'Rye': 'orange',
      'Merchandise': 'cyan',
      'Experiences': 'purple',
    };
    return colors[category] || 'gray';
  };

  return (
    <div className="relative h-full overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6 transition-all hover:border-purple-500/30">
      <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-transparent to-transparent opacity-60"></div>
      
      <div className="relative h-full flex flex-col">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-white tracking-tight">Top Products</h3>
            <p className="mt-1.5 text-sm text-slate-400 font-medium">Best performers</p>
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => setSortBy('revenue')}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                sortBy === 'revenue'
                  ? 'bg-white/20 text-white border border-white/30'
                  : 'text-slate-400 hover:text-white hover:bg-white/10'
              }`}
            >
              Revenue
            </button>
            <button
              onClick={() => setSortBy('units')}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                sortBy === 'units'
                  ? 'bg-white/20 text-white border border-white/30'
                  : 'text-slate-400 hover:text-white hover:bg-white/10'
              }`}
            >
              Units
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto custom-scrollbar">
          <Table>
            <TableHead>
              <TableRow className="border-b border-white/10">
                <TableHeaderCell className="text-xs font-semibold text-slate-400">Product</TableHeaderCell>
                <TableHeaderCell className="text-xs font-semibold text-slate-400">Cat.</TableHeaderCell>
                <TableHeaderCell className="text-right text-xs font-semibold text-slate-400">Units</TableHeaderCell>
                <TableHeaderCell className="text-right text-xs font-semibold text-slate-400">Revenue</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedItems.slice(0, 8).map((item, idx) => (
                <TableRow key={item.sku} className="border-b border-white/5 hover:bg-white/5">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className={`flex h-6 w-6 items-center justify-center rounded text-xs font-bold ${
                        idx === 0 ? 'bg-amber-500/20 text-amber-300' :
                        idx === 1 ? 'bg-slate-500/20 text-slate-300' :
                        idx === 2 ? 'bg-orange-500/20 text-orange-300' :
                        'bg-white/10 text-slate-400'
                      }`}>
                        {idx + 1}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-white">{item.productTitle}</p>
                        <p className="text-xs text-slate-500">{item.sku}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge color={getCategoryColor(item.category)} size="xs">
                      {item.category || 'N/A'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <p className="text-sm text-slate-300">{item.qty.toLocaleString()}</p>
                  </TableCell>
                  <TableCell className="text-right">
                    <p className="text-sm font-semibold text-white">
                      ${item.revenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
