import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { phoneNumber, consent } = await request.json();

    if (!phoneNumber || typeof consent !== 'boolean') {
      return NextResponse.json(
        { error: 'Phone number and consent status are required' },
        { status: 400 }
      );
    }

    // Here you would typically store the consent in your database
    // For now, we'll just log it and return success
    console.log(`SMS Consent: ${phoneNumber} - ${consent ? 'granted' : 'revoked'}`);

    // In a real implementation, you would:
    // 1. Validate the phone number format
    // 2. Store the consent status in your database with timestamp
    // 3. Handle any database errors appropriately

    return NextResponse.json({
      success: true,
      message: `SMS consent ${consent ? 'granted' : 'revoked'} for ${phoneNumber}`,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('SMS consent error:', error);
    return NextResponse.json(
      { error: 'Failed to process SMS consent' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const phoneNumber = searchParams.get('phoneNumber');

    if (!phoneNumber) {
      return NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400 }
      );
    }

    // Here you would typically check the consent status in your database
    // For now, we'll return a default response
    console.log(`Checking SMS consent status for: ${phoneNumber}`);

    // In a real implementation, you would:
    // 1. Query your database for the consent status
    // 2. Return the actual consent status and timestamp

    return NextResponse.json({
      phoneNumber,
      consent: false, // Default to false for safety
      timestamp: new Date().toISOString(),
      message: 'No consent record found'
    });

  } catch (error) {
    console.error('SMS consent check error:', error);
    return NextResponse.json(
      { error: 'Failed to check SMS consent' },
      { status: 500 }
    );
  }
}
