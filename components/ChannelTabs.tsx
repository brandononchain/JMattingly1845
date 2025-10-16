'use client';

import { useRouter, useSearchParams } from 'next/navigation';

interface ChannelTabsProps {
  currentChannel: string;
}

export default function ChannelTabs({ currentChannel }: ChannelTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const channels = [
    { id: 'all', name: 'All Channels', gradient: 'from-slate-400 to-slate-500' },
    { id: 'shopify', name: 'Shopify', gradient: 'from-emerald-400 to-green-500' },
    { id: 'square', name: 'Square', gradient: 'from-blue-400 to-indigo-500' },
    { id: 'anyroad', name: 'AnyRoad', gradient: 'from-purple-400 to-pink-500' },
  ];

  const handleChannelChange = (channelId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    
    if (channelId === 'all') {
      params.delete('channel');
    } else {
      params.set('channel', channelId);
    }

    router.push(`/?${params.toString()}`);
  };

  return (
    <div className="flex flex-wrap gap-2">
      {channels.map((channel) => (
        <button
          key={channel.id}
          onClick={() => handleChannelChange(channel.id)}
          className={`relative overflow-hidden rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
            currentChannel === channel.id
              ? `bg-gradient-to-r ${channel.gradient} text-white shadow-lg`
              : 'bg-white/10 text-slate-300 hover:bg-white/20 hover:text-white'
          }`}
        >
          {channel.name}
        </button>
      ))}
    </div>
  );
}
