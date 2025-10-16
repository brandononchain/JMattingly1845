import { format, startOfWeek, startOfMonth, startOfYear, subDays, subWeeks, subMonths, subYears, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval } from 'date-fns';
import KpiCard from '@/components/KpiCard';
import ChannelTabs from '@/components/ChannelTabs';
import DatePicker from '@/components/DatePicker';
import DataHealth from '@/components/DataHealth';
import SalesChart from '@/components/SalesChart';
import UnitsChart from '@/components/UnitsChart';
import TopItemsTable from '@/components/TopItemsTable';
import TopMarketsTable from '@/components/TopMarketsTable';
import LocationFilter from '@/components/LocationFilter';
import EventSchedule from '@/components/EventSchedule';
import Demographics from '@/components/Demographics';
import WebsiteTraffic from '@/components/WebsiteTraffic';

export const revalidate = 3600;

interface DashboardPageProps {
  searchParams: {
    period?: 'today' | 'wtd' | 'mtd' | 'ytd' | 'custom';
    channel?: string;
    location?: string;
    startDate?: string;
    endDate?: string;
  };
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const period = searchParams.period || 'mtd';
  const channel = searchParams.channel || 'all';
  const location = searchParams.location || 'all';

  const calculateDateRange = (
    p: string,
    customStart?: string,
    customEnd?: string
  ): { startDate: string; endDate: string } => {
    const today = new Date();
    let start: Date;
    let end: Date = today;

    switch (p) {
      case 'today':
        start = today;
        break;
      case 'wtd':
        start = startOfWeek(today, { weekStartsOn: 1 });
        break;
      case 'ytd':
        start = startOfYear(today);
        break;
      case 'custom':
        start = customStart ? new Date(customStart) : startOfMonth(today);
        end = customEnd ? new Date(customEnd) : today;
        break;
      case 'mtd':
      default:
        start = startOfMonth(today);
        break;
    }

    return {
      startDate: format(start, 'yyyy-MM-dd'),
      endDate: format(end, 'yyyy-MM-dd'),
    };
  };

  const { startDate, endDate } = calculateDateRange(
    period,
    searchParams.startDate,
    searchParams.endDate
  );

  // Generate dynamic data based on period
  const generateDynamicData = (period: string, start: string, end: string) => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    
    // Calculate data points based on period
    let dataPoints = 14; // default
    let dateFormat = 'MMM d';
    
    switch (period) {
      case 'today':
        dataPoints = 24; // hourly data for today
        dateFormat = 'HH:mm';
        break;
      case 'wtd':
        dataPoints = 7; // daily data for week
        dateFormat = 'EEE';
        break;
      case 'mtd':
        dataPoints = Math.min(daysDiff, 31); // daily data for month
        dateFormat = 'MMM d';
        break;
      case 'ytd':
        dataPoints = 12; // monthly data for year
        dateFormat = 'MMM';
        break;
    }

    // Generate time series data
    const timeSeriesData = Array.from({ length: dataPoints }, (_, i) => {
      let date: Date;
      let baseSales: number;
      let baseUnits: number;
      
      switch (period) {
        case 'today':
          date = new Date(startDate.getTime() + i * 60 * 60 * 1000); // hourly
          baseSales = 400 + Math.random() * 200;
          baseUnits = 15 + Math.random() * 10;
          break;
        case 'wtd':
          date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000); // daily
          baseSales = 3000 + Math.random() * 2000;
          baseUnits = 60 + Math.random() * 40;
          break;
        case 'mtd':
          date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000); // daily
          baseSales = 4000 + Math.random() * 3000;
          baseUnits = 80 + Math.random() * 50;
          break;
        case 'ytd':
          date = new Date(startDate.getFullYear(), i, 1); // monthly
          baseSales = 15000 + Math.random() * 10000;
          baseUnits = 300 + Math.random() * 200;
          break;
        default:
          date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
          baseSales = 4000 + Math.random() * 3000;
          baseUnits = 80 + Math.random() * 50;
      }

      return {
        date: format(date, dateFormat),
        sales: Math.round(baseSales),
        units: Math.round(baseUnits),
        transactions: Math.round(baseSales / 250), // approximate transactions
      };
    });

    // Calculate KPIs based on period
    const totalSales = timeSeriesData.reduce((sum, d) => sum + d.sales, 0);
    const totalUnits = timeSeriesData.reduce((sum, d) => sum + d.units, 0);
    const totalTxns = timeSeriesData.reduce((sum, d) => sum + d.transactions, 0);
    const aov = totalSales / totalTxns;
    
    // Adjust customer count based on period
    let customerMultiplier = 1;
    switch (period) {
      case 'today':
        customerMultiplier = 0.05;
        break;
      case 'wtd':
        customerMultiplier = 0.3;
        break;
      case 'mtd':
        customerMultiplier = 1;
        break;
      case 'ytd':
        customerMultiplier = 12;
        break;
    }

    return {
      timeSeriesData,
      kpis: {
        sales: totalSales,
        txns: totalTxns,
        units: totalUnits,
        aov: aov,
        itemsPerCustomer: totalUnits / (2847 * customerMultiplier),
        customers: Math.round(2847 * customerMultiplier),
        growthVsPrevious: 10 + Math.random() * 20, // 10-30% growth
      }
    };
  };

  const dynamicData = generateDynamicData(period, startDate, endDate);

  // Mock data
  const locations = [
    { id: 'loc-1', name: 'Downtown Store', channel: 'square' },
    { id: 'loc-2', name: 'Online Store', channel: 'shopify' },
    { id: 'loc-3', name: 'Tasting Room', channel: 'anyroad' },
  ];

  // Use dynamic data
  const kpis = dynamicData.kpis;
  const dailyTrend = dynamicData.timeSeriesData;

  const salesChartData = dailyTrend.map((d) => ({
    date: d.date,
    sales: d.sales,
  }));

  const unitsChartData = dailyTrend.map((d) => ({
    date: d.date,
    units: d.units,
  }));

  const topItems = Array.from({ length: 10 }, (_, i) => ({
    rank: i + 1,
    sku: `SKU-${1000 + i}`,
    productTitle: `J. Mattingly ${['Small Batch Bourbon', 'Single Barrel Bourbon', 'Straight Rye', 'Reserve Bourbon', 'Heritage Edition', 'Distillery T-Shirt', 'Whiskey Glass Set', 'Barrel Aged Bitters', 'Tasting Flight', 'Private Tour'][i]}`,
    category: ['Bourbon', 'Rye', 'Merchandise', 'Experiences'][i % 4],
    revenue: 15000 - i * 1200,
    qty: 120 - i * 8,
  }));

  const topCategories = [
    { rank: 1, category: 'Bourbon', revenue: 85000, units: 680, share: 68 },
    { rank: 2, category: 'Merchandise', revenue: 25000, units: 250, share: 20 },
    { rank: 3, category: 'Rye', revenue: 10000, units: 85, share: 8 },
    { rank: 4, category: 'Experiences', revenue: 5000, units: 20, share: 4 },
  ];

  // Event scheduling data
  const eventSchedule = {
    tomorrow: 24,
    nextWeek: 156,
    nextMonth: 847,
  };

  // Demographics data
  const stateData = [
    { state: 'Kentucky', customers: 842 },
    { state: 'Tennessee', customers: 567 },
    { state: 'Ohio', customers: 423 },
    { state: 'Indiana', customers: 387 },
    { state: 'Illinois', customers: 298 },
    { state: 'Georgia', customers: 245 },
    { state: 'Texas', customers: 198 },
    { state: 'Florida', customers: 165 },
  ];

  // Website traffic data (dynamic based on period)
  const trafficData = dailyTrend.map((d, i) => ({
    date: d.date,
    visitors: Math.round(300 + Math.random() * 200 + (i * 10)), // slightly increasing trend
    pageViews: Math.round(800 + Math.random() * 400 + (i * 20)),
  }));

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Animated gradient orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute top-1/2 -left-40 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse" style={{animationDelay: '1s'}}></div>
        <div className="absolute -bottom-40 right-1/3 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-pulse" style={{animationDelay: '2s'}}></div>
      </div>

      <div className="relative mx-auto max-w-[1920px] px-6 py-8 lg:px-8">
        {/* Header */}
        <header className="mb-10">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <h1 className="text-4xl font-bold bg-gradient-to-r from-white via-purple-200 to-cyan-200 bg-clip-text text-transparent tracking-tight leading-tight">
                Analytics Command Center
              </h1>
              <p className="text-sm text-slate-400 font-medium leading-relaxed">
                J. Mattingly 1845 · Real-time business intelligence
              </p>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 backdrop-blur-xl px-4 py-2.5">
              <div className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400"></span>
              </div>
              <span className="text-sm font-bold text-emerald-200">Live Data</span>
            </div>
          </div>
        </header>

        {/* Filters */}
        <nav aria-label="Dashboard filters" className="mb-8">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex-1">
                <ChannelTabs currentChannel={channel} />
              </div>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center lg:flex-shrink-0">
                <LocationFilter locations={locations} currentLocation={location} />
                <DatePicker currentPreset={period as any} startDate={startDate} endDate={endDate} />
              </div>
            </div>
          </div>
        </nav>

        {/* Bento Grid Layout */}
        <div className="grid grid-cols-12 gap-5 auto-rows-[180px]">
          {/* Row 1-2: KPIs */}
          <div className="col-span-12 sm:col-span-6 lg:col-span-3 lg:row-span-2">
            <KpiCard
              title="Total Revenue"
              value={kpis.sales}
              format="currency"
              trend={kpis.growthVsPrevious}
              variant="large"
            />
          </div>

          <div className="col-span-6 sm:col-span-3 lg:col-span-2">
            <KpiCard
              title="Transactions"
              value={kpis.txns}
              format="number"
              trend={12.5}
            />
          </div>

          <div className="col-span-6 sm:col-span-3 lg:col-span-2">
            <KpiCard
              title="Customers"
              value={kpis.customers}
              format="number"
              trend={8.3}
            />
          </div>

          <div className="col-span-6 sm:col-span-3 lg:col-span-2">
            <KpiCard
              title="Avg Order"
              value={kpis.aov}
              format="currency"
            />
          </div>

          <div className="col-span-12 sm:col-span-6 lg:col-span-3 lg:row-span-2">
            <DataHealth />
          </div>

          <div className="col-span-6 sm:col-span-3 lg:col-span-2">
            <KpiCard
              title="Items / Order"
              value={kpis.itemsPerCustomer}
              format="decimal"
            />
          </div>

          <div className="col-span-6 sm:col-span-3 lg:col-span-2">
            <div className="h-full rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-500/10 to-pink-500/10 backdrop-blur-xl p-5 flex flex-col justify-between">
              <p className="text-sm font-medium text-purple-300">Total Units</p>
              <p className="text-4xl font-bold text-white">{kpis.units.toLocaleString()}</p>
              <p className="text-xs text-slate-500 mt-2">All channels combined</p>
            </div>
          </div>

          <div className="col-span-6 sm:col-span-3 lg:col-span-2">
            <div className="h-full rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/10 to-blue-500/10 backdrop-blur-xl p-5 flex flex-col justify-between">
              <p className="text-sm font-medium text-cyan-300">Growth Rate</p>
              <p className="text-4xl font-bold text-white">+{kpis.growthVsPrevious.toFixed(1)}%</p>
              <div className="flex items-center gap-1 mt-2">
                <div className="h-1 w-1 rounded-full bg-emerald-400 animate-pulse"></div>
                <p className="text-xs text-slate-500">vs last period</p>
              </div>
            </div>
          </div>

          {/* Row 3-5: Charts */}
          <div className="col-span-12 lg:col-span-6 lg:row-span-3">
            <SalesChart 
              data={salesChartData} 
              title={`Revenue Trend - ${period === 'today' ? 'Today (Hourly)' : period === 'wtd' ? 'Week to Date' : period === 'mtd' ? 'Month to Date' : 'Year to Date'}`} 
            />
          </div>

          <div className="col-span-12 lg:col-span-6 lg:row-span-3">
            <UnitsChart 
              data={unitsChartData} 
              title={`Units Trend - ${period === 'today' ? 'Today (Hourly)' : period === 'wtd' ? 'Week to Date' : period === 'mtd' ? 'Month to Date' : 'Year to Date'}`} 
            />
          </div>

          {/* Row 6-7: Analytics Sections */}
          <div className="col-span-12 lg:col-span-4 lg:row-span-3">
            <WebsiteTraffic data={trafficData} />
          </div>

          <div className="col-span-12 lg:col-span-4 lg:row-span-3">
            <Demographics states={stateData} totalCustomers={kpis.customers} />
          </div>

          <div className="col-span-12 lg:col-span-4 lg:row-span-3">
            <EventSchedule 
              tomorrow={eventSchedule.tomorrow}
              nextWeek={eventSchedule.nextWeek}
              nextMonth={eventSchedule.nextMonth}
            />
          </div>

          {/* Row 9-11: Tables */}
          <div className="col-span-12 lg:col-span-6 lg:row-span-3">
            <TopItemsTable items={topItems} />
          </div>

          <div className="col-span-12 lg:col-span-6 lg:row-span-3">
            <TopMarketsTable markets={topCategories} />
          </div>
        </div>
      </div>
    </div>
  );
}
