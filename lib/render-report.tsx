/**
 * Report PDF Rendering
 * 
 * Converts React components to PDF using Playwright (Chromium).
 * Optimized for A4 print with proper margins and headers/footers.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { ReportContent } from './report';
import { chromium } from 'playwright';
import { logger } from './logger';
import { format } from 'date-fns';

interface ReportParams {
  period: 'daily' | 'weekly' | 'monthly';
  date?: string;
}

/**
 * Render report to PDF buffer
 */
export async function renderReportToPdf(
  data: any,
  params?: ReportParams
): Promise<Buffer> {
  const period = params?.period || 'weekly';
  const reportDate = params?.date || format(new Date(), 'yyyy-MM-dd');

  logger.info('Starting PDF render', { period, date: reportDate });

  try {
    // Render React component to HTML string
    const html = renderToStaticMarkup(<ReportContent data={data} />);

    // Wrap with DOCTYPE for proper rendering
    const fullHtml = `<!DOCTYPE html>${html}`;

    // Launch Playwright browser
    const browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    try {
      const page = await browser.newPage();
      
      // Set content and wait for fonts/styles to load
      await page.setContent(fullHtml, {
        waitUntil: 'networkidle',
        timeout: 30000,
      });

      // Generate PDF with A4 format and proper margins
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        margin: {
          top: '20mm',
          right: '15mm',
          bottom: '20mm',
          left: '15mm',
        },
        displayHeaderFooter: true,
        headerTemplate: `
          <div style="font-size: 9px; color: #6b7280; width: 100%; text-align: center; padding: 5px 15mm 0 15mm;">
            <span>J. Mattingly 1845 - ${period.toUpperCase()} Report</span>
          </div>
        `,
        footerTemplate: `
          <div style="font-size: 9px; color: #6b7280; width: 100%; text-align: center; padding: 0 15mm 5px 15mm;">
            <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span> | Generated: ${format(new Date(), 'MMM d, yyyy h:mm a')}</span>
          </div>
        `,
      });

      logger.info('PDF rendered successfully', {
        size: pdfBuffer.length,
        period,
        pages: pdfBuffer.length / 1024 / 100, // Rough estimate
      });

      return pdfBuffer;
    } finally {
      await browser.close();
    }
  } catch (error) {
    logger.error('Failed to render PDF', error, { period, date: reportDate });
    throw error;
  }
}

/**
 * Alternative: Render report to HTML string (for preview)
 */
export function renderReportHtml(data: any): string {
  const html = renderToStaticMarkup(<ReportContent data={data} />);
  return `<!DOCTYPE html>${html}`;
}

