'use client';

import { Card, Title, LineChart } from '@tremor/react';

interface RevenueChartProps {
  data: Array<{
    date: string;
    revenue: number;
    orders: number;
  }>;
  channel?: string;
}

export default function RevenueChart({ data, channel = 'all' }: RevenueChartProps) {
  const dataFormatter = (number: number) =>
    `$${Intl.NumberFormat('us').format(number).toString()}`;

  return (
    <Card>
      <Title>
        Revenue Trend {channel !== 'all' && `(${channel.charAt(0).toUpperCase() + channel.slice(1)})`}
      </Title>
      <LineChart
        className="mt-6 h-80"
        data={data}
        index="date"
        categories={['revenue']}
        colors={['indigo']}
        valueFormatter={dataFormatter}
        yAxisWidth={80}
        showLegend={false}
        showAnimation={true}
      />
    </Card>
  );
}

