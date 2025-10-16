'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MapPinIcon, ChevronDownIcon } from '@heroicons/react/24/outline';

interface Location {
  id: string;
  name: string;
  channel: string;
}

interface LocationFilterProps {
  locations: Location[];
  currentLocation: string;
}

export default function LocationFilter({ locations, currentLocation }: LocationFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleLocationChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    
    if (value === 'all') {
      params.delete('location');
    } else {
      params.set('location', value);
    }

    router.push(`/?${params.toString()}`);
    setIsOpen(false);
  };

  const getCurrentLocationName = () => {
    if (currentLocation === 'all') return 'All Locations';
    const loc = locations.find(l => l.id === currentLocation);
    return loc?.name || 'All Locations';
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const allLocations = [{ id: 'all', name: 'All Locations', channel: 'all' }, ...locations];

  return (
    <div className="relative w-52" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 backdrop-blur-xl px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-white/10 hover:border-white/20 focus:outline-none focus:ring-2 focus:ring-white/20"
      >
        <div className="flex items-center gap-2">
          <MapPinIcon className="h-4 w-4 text-slate-400" strokeWidth={2} />
          <span>{getCurrentLocationName()}</span>
        </div>
        <ChevronDownIcon 
          className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} 
          strokeWidth={2}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-white/20 bg-slate-900/95 backdrop-blur-2xl shadow-2xl">
          <div className="py-1.5">
            {allLocations.map((location) => (
              <button
                key={location.id}
                onClick={() => handleLocationChange(location.id)}
                className={`w-full px-4 py-2.5 text-left text-sm font-medium transition-all ${
                  currentLocation === location.id
                    ? 'bg-white/10 text-white'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  {location.id === 'all' ? (
                    <span className="text-base">📍</span>
                  ) : (
                    <div className="h-2 w-2 rounded-full bg-cyan-400"></div>
                  )}
                  <span>{location.name}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
