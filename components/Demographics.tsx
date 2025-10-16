'use client';

import { GlobeAmericasIcon } from '@heroicons/react/24/outline';

interface DemographicsProps {
  states: Array<{ state: string; customers: number }>;
  totalCustomers: number;
}

export default function Demographics({ states, totalCustomers }: DemographicsProps) {
  const topStates = states.slice(0, 8);
  const maxCustomers = Math.max(...topStates.map(s => s.customers));

  return (
    <div className="relative h-full overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-blue-500/5 opacity-50"></div>
      
      <div className="relative h-full flex flex-col">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 p-2.5">
              <GlobeAmericasIcon className="h-5 w-5 text-white" strokeWidth={2} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Customer Demographics</h3>
              <p className="text-sm text-slate-400">Top states by customer count</p>
            </div>
          </div>
        </div>

        {/* Total Customers */}
        <div className="mb-6 rounded-xl border border-cyan-500/20 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 p-4">
          <p className="text-sm font-medium text-cyan-300">Total Customers</p>
          <p className="mt-2 text-4xl font-bold text-white">{totalCustomers.toLocaleString()}</p>
        </div>

        {/* State Distribution */}
        <div className="flex-1 overflow-auto custom-scrollbar pr-2">
          <div className="space-y-3">
            {topStates.map((state, index) => {
              const percentage = (state.customers / maxCustomers) * 100;
              return (
                <div key={state.state} className="group">
                  <div className="flex items-center justify-between mb-2 pr-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-gradient-to-r from-cyan-400 to-blue-500"></div>
                      <span className="text-sm font-medium text-white">{state.state}</span>
                    </div>
                    <span className="text-sm font-bold text-cyan-300">{state.customers.toLocaleString()}</span>
                  </div>
                  <div className="relative h-2 bg-slate-800/50 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full transition-all duration-1000 ease-out"
                      style={{ 
                        width: `${percentage}%`,
                        animationDelay: `${index * 100}ms`
                      }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

