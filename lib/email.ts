import { Resend } from 'resend';
import { logger } from './logger';

const resend = new Resend(process.env.RESEND_API_KEY!);
const FROM_EMAIL = process.env.EMAIL_FROM || 'reports@jmattingly1845.com';

interface SendReportEmailParams {
  recipients: string[];
  subject: string;
  pdfBuffer: Buffer;
  reportData: {
    summary: {
      totalRevenue: number;
      totalOrders: number;
      avgOrderValue: number;
    };
  };
  startDate: string;
  endDate: string;
}

export async function sendReportEmail({
  recipients,
  subject,
  pdfBuffer,
  reportData,
  startDate,
  endDate,
}: SendReportEmailParams): Promise<void> {
  try {
    const { summary } = reportData;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 30px;
              border-radius: 8px;
              margin-bottom: 30px;
            }
            .header h1 {
              margin: 0;
              font-size: 24px;
            }
            .summary {
              background: #f7fafc;
              padding: 20px;
              border-radius: 8px;
              margin-bottom: 30px;
            }
            .metric {
              display: flex;
              justify-content: space-between;
              padding: 10px 0;
              border-bottom: 1px solid #e2e8f0;
            }
            .metric:last-child {
              border-bottom: none;
            }
            .metric-label {
              color: #718096;
              font-size: 14px;
            }
            .metric-value {
              font-weight: bold;
              font-size: 18px;
              color: #2d3748;
            }
            .footer {
              text-align: center;
              color: #a0aec0;
              font-size: 12px;
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #e2e8f0;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>📊 Performance Report</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">
              ${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}
            </p>
          </div>

          <div class="summary">
            <h2 style="margin-top: 0;">Executive Summary</h2>
            
            <div class="metric">
              <span class="metric-label">Total Revenue</span>
              <span class="metric-value">$${summary.totalRevenue.toLocaleString()}</span>
            </div>
            
            <div class="metric">
              <span class="metric-label">Total Orders</span>
              <span class="metric-value">${summary.totalOrders.toLocaleString()}</span>
            </div>
            
            <div class="metric">
              <span class="metric-label">Average Order Value</span>
              <span class="metric-value">$${summary.avgOrderValue.toFixed(2)}</span>
            </div>
          </div>

          <p>
            Please find the detailed performance report attached to this email. The report includes:
          </p>
          
          <ul>
            <li>Complete channel performance breakdown</li>
            <li>Top performing products</li>
            <li>Period-over-period comparisons</li>
            <li>Key metrics and trends</li>
          </ul>

          <div class="footer">
            <p>
              This is an automated report from J. Mattingly 1845 Analytics Dashboard<br>
              Generated on ${new Date().toLocaleString()}
            </p>
          </div>
        </body>
      </html>
    `;

    const filename = `jmattingly-report-${startDate}-to-${endDate}.pdf`;

    await resend.emails.send({
      from: FROM_EMAIL,
      to: recipients,
      subject,
      html,
      attachments: [
        {
          filename,
          content: pdfBuffer,
        },
      ],
    });

    logger.info('Report email sent successfully', {
      recipients: recipients.length,
      subject,
      pdfSize: pdfBuffer.length,
    });
  } catch (error) {
    logger.error('Failed to send report email', error, {
      recipients: recipients.length,
    });
    throw error;
  }
}

