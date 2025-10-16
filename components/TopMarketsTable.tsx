'use client';

import {
  Table,
  TableHead,
  TableRow,
  TableHeaderCell,
  TableBody,
  TableCell,
  ProgressBar,
} from '@tremor/react';

interface TopMarket {
  category: string;
  revenue: number;
  units: number;
}

interface TopMarketsTableProps {
  markets: Array<TopMarket & { share: number }>;
}

export default function TopMarketsTable({ markets }: TopMarketsTableProps) {
  const totalRevenue = markets.reduce((sum, m) => sum + m.revenue, 0);

  const getBarColor = (index: number): "emerald" | "cyan" | "purple" | "pink" => {
    const colors: Array<"emerald" | "cyan" | "purple" | "pink"> = ['emerald', 'cyan', 'purple', 'pink'];
    return colors[index % colors.length];
  };

  return (
    <div className="relative h-full overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6 transition-all hover:border-pink-500/30">
      <div className="absolute inset-0 bg-gradient-to-br from-pink-500/10 via-transparent to-transparent opacity-60"></div>
      
      <div className="relative h-full flex flex-col">
        <div className="mb-5">
          <h3 className="text-lg font-bold text-white tracking-tight">Top Categories</h3>
          <p className="mt-1.5 text-sm text-slate-400 font-medium">Revenue distribution</p>
        </div>

        <div className="flex-1 overflow-auto custom-scrollbar">
          <Table>
            <TableHead>
              <TableRow className="border-b border-white/10">
                <TableHeaderCell className="text-xs font-semibold text-slate-400">Category</TableHeaderCell>
                <TableHeaderCell className="text-right text-xs font-semibold text-slate-400">Revenue</TableHeaderCell>
                <TableHeaderCell className="text-xs font-semibold text-slate-400">Share</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {markets.map((market, idx) => {
                const percentage = totalRevenue > 0 ? (market.revenue / totalRevenue) * 100 : 0;

                return (
                  <TableRow key={market.category} className="border-b border-white/5 hover:bg-white/5">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className={`h-2 w-2 rounded-full ${
                          idx === 0 ? 'bg-emerald-400' :
                          idx === 1 ? 'bg-cyan-400' :
                          idx === 2 ? 'bg-purple-400' :
                          'bg-pink-400'
                        }`}></div>
                        <p className="text-sm font-medium text-white">{market.category}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <p className="text-sm font-semibold text-white">
                        ${market.revenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </p>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <ProgressBar 
                          value={percentage} 
                          color={getBarColor(idx)}
                          className="w-full"
                        />
                        <p className="w-12 text-right text-sm font-semibold text-slate-300">
                          {percentage.toFixed(0)}%
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
