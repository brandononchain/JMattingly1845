'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { CalendarIcon } from '@heroicons/react/24/outline';

interface DatePickerProps {
  currentPreset: 'today' | 'wtd' | 'mtd' | 'ytd' | 'custom';
  startDate: string;
  endDate: string;
}

export default function DatePicker({ currentPreset, startDate, endDate }: DatePickerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const presets = [
    { id: 'today', label: 'Today' },
    { id: 'wtd', label: 'Week' },
    { id: 'mtd', label: 'Month' },
    { id: 'ytd', label: 'Year' },
  ];

  const handlePresetChange = (presetId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('period', presetId);
    params.delete('startDate');
    params.delete('endDate');
    router.push(`/?${params.toString()}`);
  };

  return (
    <div className="flex items-center gap-2">
      {/* Preset Buttons */}
      <div className="inline-flex gap-1">
        {presets.map((preset) => (
          <button
            key={preset.id}
            onClick={() => handlePresetChange(preset.id)}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition-all ${
              currentPreset === preset.id
                ? 'bg-white/20 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Date Range Display */}
      <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
        <CalendarIcon className="h-4 w-4 text-slate-400" />
        <span className="text-sm font-medium text-slate-300">
          {format(new Date(startDate), 'MMM d')} - {format(new Date(endDate), 'MMM d')}
        </span>
      </div>
    </div>
  );
}
