'use client';

import { Card, Title, DonutChart } from '@tremor/react';

interface ChannelBreakdownChartProps {
  data: Array<{
    name: string;
    value: number;
  }>;
}

export default function ChannelBreakdownChart({ data }: ChannelBreakdownChartProps) {
  const valueFormatter = (number: number) =>
    `$${Intl.NumberFormat('us').format(number).toString()}`;

  return (
    <Card>
      <Title>Revenue by Channel</Title>
      <DonutChart
        className="mt-6"
        data={data}
        category="value"
        index="name"
        valueFormatter={valueFormatter}
        colors={['emerald', 'blue', 'violet']}
        showAnimation={true}
      />
    </Card>
  );
}

