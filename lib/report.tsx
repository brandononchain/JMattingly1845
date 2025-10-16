/**
 * Print-Styled Report Components
 * 
 * SSR components designed for PDF generation with Playwright.
 * Uses inline styles for consistent rendering across environments.
 */

import { format } from 'date-fns';

interface ReportData {
  metadata: {
    period: string;
    startDate: string;
    endDate: string;
    generatedAt: string;
    comparisonStart: string;
    comparisonEnd: string;
  };
  summary: {
    sales: number;
    txns: number;
    units: number;
    aov: number;
    itemsPerCustomer: number;
    salesTrend: number;
    txnsTrend: number;
    aovTrend: number;
  };
  trends: Array<{ date: string; sales: number; txns: number }>;
  channels: Array<{
    channelId: string;
    channelName: string;
    sales: number;
    txns: number;
    aov: number;
    units: number;
    percentOfTotal: number;
  }>;
  topProducts: Array<{
    sku: string;
    productTitle: string;
    qty: number;
    revenue: number;
  }>;
  topCategories: Array<{
    category: string;
    revenue: number;
    units: number;
  }>;
}

interface ReportContentProps {
  data: ReportData;
}

export function ReportContent({ data }: ReportContentProps) {
  const { metadata, summary, channels, topProducts, topCategories, trends } = data;

  const formatTrend = (value: number) => {
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
  };

  const getTrendClass = (value: number) => {
    if (value > 0) return 'trend-positive';
    if (value < 0) return 'trend-negative';
    return 'trend-neutral';
  };

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>J. Mattingly 1845 - {metadata.period.toUpperCase()} Report</title>
        <style>{`
          @page {
            size: A4;
            margin: 20mm;
          }

          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }

          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #1f2937;
            font-size: 10pt;
          }

          .report-container {
            max-width: 100%;
          }

          .header {
            border-bottom: 4px solid #4f46e5;
            padding-bottom: 16px;
            margin-bottom: 32px;
          }

          .header h1 {
            font-size: 28px;
            font-weight: 700;
            color: #111827;
            margin-bottom: 4px;
          }

          .header .subtitle {
            font-size: 14px;
            color: #6b7280;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }

          .header .period-info {
            font-size: 12px;
            color: #9ca3af;
            margin-top: 8px;
          }

          .summary-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 16px;
            margin-bottom: 32px;
          }

          .summary-card {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            border-radius: 8px;
          }

          .summary-card h3 {
            font-size: 11px;
            text-transform: uppercase;
            opacity: 0.9;
            margin-bottom: 8px;
            font-weight: 600;
            letter-spacing: 0.5px;
          }

          .summary-card .value {
            font-size: 32px;
            font-weight: 700;
            margin-bottom: 8px;
            line-height: 1;
          }

          .summary-card .trend {
            font-size: 12px;
            opacity: 0.95;
            font-weight: 500;
          }

          .section {
            margin-bottom: 32px;
            page-break-inside: avoid;
          }

          .section h2 {
            font-size: 18px;
            font-weight: 700;
            color: #111827;
            margin-bottom: 16px;
            padding-bottom: 8px;
            border-bottom: 2px solid #e5e7eb;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 10pt;
          }

          thead {
            background: #f9fafb;
          }

          th {
            text-align: left;
            padding: 10px 12px;
            font-size: 9pt;
            text-transform: uppercase;
            color: #6b7280;
            font-weight: 600;
            border-bottom: 2px solid #e5e7eb;
            letter-spacing: 0.3px;
          }

          th.text-right {
            text-align: right;
          }

          td {
            padding: 10px 12px;
            border-bottom: 1px solid #f3f4f6;
          }

          td.text-right {
            text-align: right;
          }

          tbody tr:last-child td {
            border-bottom: none;
          }

          tbody tr:hover {
            background: #fafafa;
          }

          .capitalize {
            text-transform: capitalize;
          }

          .trend-positive {
            color: #059669;
          }

          .trend-negative {
            color: #dc2626;
          }

          .trend-neutral {
            color: #6b7280;
          }

          .footer {
            margin-top: 48px;
            padding-top: 16px;
            border-top: 2px solid #e5e7eb;
            font-size: 9pt;
            color: #9ca3af;
            text-align: center;
          }

          .badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 9pt;
            font-weight: 600;
            background: #e0e7ff;
            color: #4338ca;
          }

          .metric-row {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 16px;
            margin-bottom: 24px;
            padding: 16px;
            background: #f9fafb;
            border-radius: 8px;
          }

          .metric-item {
            text-align: center;
          }

          .metric-item .label {
            font-size: 9pt;
            color: #6b7280;
            text-transform: uppercase;
            margin-bottom: 4px;
          }

          .metric-item .value {
            font-size: 20px;
            font-weight: 700;
            color: #111827;
          }

          @media print {
            body {
              padding: 0;
            }

            .section {
              page-break-inside: avoid;
            }

            table {
              page-break-inside: auto;
            }

            tr {
              page-break-inside: avoid;
              page-break-after: auto;
            }
          }
        `}</style>
      </head>
      <body>
        <div className="report-container">
          {/* Header */}
          <div className="header">
            <h1>J. Mattingly 1845</h1>
            <div className="subtitle">{metadata.period} Performance Report</div>
            <div className="period-info">
              {format(new Date(metadata.startDate), 'MMMM d, yyyy')} -{' '}
              {format(new Date(metadata.endDate), 'MMMM d, yyyy')}
            </div>
          </div>

          {/* Executive Summary */}
          <div className="summary-grid">
            <div className="summary-card">
              <h3>Total Sales</h3>
              <div className="value">${summary.sales.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div className="trend">{formatTrend(summary.salesTrend)} vs previous period</div>
            </div>

            <div className="summary-card">
              <h3>Transactions</h3>
              <div className="value">{summary.txns.toLocaleString()}</div>
              <div className="trend">{formatTrend(summary.txnsTrend)} vs previous period</div>
            </div>

            <div className="summary-card">
              <h3>Avg Order Value</h3>
              <div className="value">${summary.aov.toFixed(2)}</div>
              <div className="trend">{formatTrend(summary.aovTrend)} vs previous period</div>
            </div>
          </div>

          {/* Additional Metrics */}
          <div className="metric-row">
            <div className="metric-item">
              <div className="label">Total Units</div>
              <div className="value">{summary.units.toLocaleString()}</div>
            </div>
            <div className="metric-item">
              <div className="label">Items per Customer</div>
              <div className="value">{summary.itemsPerCustomer.toFixed(2)}</div>
            </div>
            <div className="metric-item">
              <div className="label">Units per Transaction</div>
              <div className="value">{summary.txns > 0 ? (summary.units / summary.txns).toFixed(1) : '0'}</div>
            </div>
            <div className="metric-item">
              <div className="label">Period</div>
              <div className="value" style={{ fontSize: '16px', textTransform: 'uppercase' }}>
                {metadata.period}
              </div>
            </div>
          </div>

          {/* Channel Performance */}
          <div className="section">
            <h2>Channel Performance</h2>
            <table>
              <thead>
                <tr>
                  <th>Channel</th>
                  <th className="text-right">Revenue</th>
                  <th className="text-right">Transactions</th>
                  <th className="text-right">AOV</th>
                  <th className="text-right">Units</th>
                  <th className="text-right">% of Total</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((channel) => (
                  <tr key={channel.channelId}>
                    <td className="capitalize" style={{ fontWeight: 600 }}>{channel.channelName}</td>
                    <td className="text-right">${channel.sales.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    <td className="text-right">{channel.txns.toLocaleString()}</td>
                    <td className="text-right">${channel.aov.toFixed(2)}</td>
                    <td className="text-right">{channel.units.toLocaleString()}</td>
                    <td className="text-right">{channel.percentOfTotal.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Top Products */}
          <div className="section">
            <h2>Top Products by Revenue</h2>
            <table>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Product</th>
                  <th>SKU</th>
                  <th className="text-right">Quantity</th>
                  <th className="text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map((product, idx) => (
                  <tr key={product.sku || idx}>
                    <td>
                      <span className="badge">{idx + 1}</span>
                    </td>
                    <td style={{ fontWeight: 500 }}>{product.productTitle}</td>
                    <td style={{ fontSize: '9pt', color: '#6b7280' }}>{product.sku || 'N/A'}</td>
                    <td className="text-right">{product.qty.toLocaleString()}</td>
                    <td className="text-right" style={{ fontWeight: 600 }}>
                      ${product.revenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Top Categories */}
          <div className="section">
            <h2>Top Categories</h2>
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th className="text-right">Units</th>
                  <th className="text-right">Revenue</th>
                  <th className="text-right">Avg Price</th>
                </tr>
              </thead>
              <tbody>
                {topCategories.map((cat) => (
                  <tr key={cat.category}>
                    <td style={{ fontWeight: 500 }}>{cat.category}</td>
                    <td className="text-right">{cat.units.toLocaleString()}</td>
                    <td className="text-right" style={{ fontWeight: 600 }}>
                      ${cat.revenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="text-right">
                      ${cat.units > 0 ? (cat.revenue / cat.units).toFixed(2) : '0.00'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Daily Trend Summary */}
          {trends.length > 0 && (
            <div className="section">
              <h2>Daily Performance Trend</h2>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th className="text-right">Sales</th>
                    <th className="text-right">Transactions</th>
                    <th className="text-right">AOV</th>
                  </tr>
                </thead>
                <tbody>
                  {trends.slice(-7).map((day) => {
                    const aov = day.txns > 0 ? day.sales / day.txns : 0;
                    return (
                      <tr key={day.date}>
                        <td>{format(new Date(day.date), 'MMM d, yyyy')}</td>
                        <td className="text-right">
                          ${day.sales.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="text-right">{day.txns.toLocaleString()}</td>
                        <td className="text-right">${aov.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer */}
          <div className="footer">
            <div>
              <strong>J. Mattingly 1845 Analytics Dashboard</strong>
            </div>
            <div style={{ marginTop: '8px' }}>
              Generated on {format(new Date(metadata.generatedAt), 'MMMM d, yyyy \'at\' h:mm a')}
            </div>
            <div style={{ marginTop: '4px', fontSize: '8pt' }}>
              Comparison Period: {format(new Date(metadata.comparisonStart), 'MMM d')} -{' '}
              {format(new Date(metadata.comparisonEnd), 'MMM d, yyyy')}
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}

