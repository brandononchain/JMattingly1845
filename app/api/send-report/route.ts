/**
 * Send Report API Endpoint
 * 
 * Temporarily disabled for UI testing.
 * Will be enabled when database is connected.
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: 'Report API temporarily disabled for UI testing',
    status: 'demo_mode',
  });
}

export async function POST(request: NextRequest) {
  return NextResponse.json({
    message: 'Report API temporarily disabled for UI testing',
    status: 'demo_mode',
  });
}
