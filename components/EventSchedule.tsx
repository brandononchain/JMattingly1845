'use client';

import { CalendarDaysIcon, UserGroupIcon } from '@heroicons/react/24/outline';

interface EventScheduleProps {
  tomorrow: number;
  nextWeek: number;
  nextMonth: number;
}

export default function EventSchedule({ tomorrow, nextWeek, nextMonth }: EventScheduleProps) {
  const schedules = [
    { label: 'Tomorrow', count: tomorrow, icon: '📅', gradient: 'from-amber-400 to-orange-500' },
    { label: 'Next Week', count: nextWeek, icon: '📆', gradient: 'from-blue-400 to-cyan-500' },
    { label: 'Next Month', count: nextMonth, icon: '🗓️', gradient: 'from-purple-400 to-pink-500' },
  ];

  return (
    <div className="relative h-full overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
      <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 via-transparent to-purple-500/5 opacity-50"></div>
      
      <div className="relative h-full flex flex-col">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 p-2.5">
              <CalendarDaysIcon className="h-5 w-5 text-white" strokeWidth={2} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Tasting Events</h3>
              <p className="text-sm text-slate-400">Upcoming bookings</p>
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-4">
          {schedules.map((schedule) => (
            <div 
              key={schedule.label}
              className="group rounded-xl border border-white/10 bg-white/5 p-5 transition-all hover:bg-white/10"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{schedule.icon}</span>
                  <div>
                    <p className="text-sm font-medium text-slate-400">{schedule.label}</p>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-3xl font-bold text-white">{schedule.count}</span>
                      <span className="text-sm text-slate-500">guests</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-center rounded-lg bg-white/5 p-3">
                  <UserGroupIcon className="h-6 w-6 text-slate-400" />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3">
          <p className="text-center text-xs font-semibold text-emerald-300">
            {tomorrow + nextWeek + nextMonth} total guests scheduled
          </p>
        </div>
      </div>
    </div>
  );
}

