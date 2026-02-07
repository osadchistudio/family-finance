import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { encrypt, decrypt, maskApiKey } from '@/lib/encryption';

// GET - Check if API key exists and return masked version
export async function GET() {
  try {
    const setting = await prisma.setting.findUnique({
      where: { key: 'anthropic_api_key' },
    });

    if (!setting) {
      return NextResponse.json({ hasKey: false });
    }

    // Decrypt and mask the key
    const decrypted = decrypt(setting.value);
    const masked = maskApiKey(decrypted);

    return NextResponse.json({
      hasKey: true,
      maskedKey: masked,
    });
  } catch (error) {
    console.error('Get API key error:', error);
    return NextResponse.json({ hasKey: false });
  }
}

// POST - Save new API key
export async function POST(request: NextRequest) {
  try {
    const { apiKey } = await request.json();

    if (!apiKey || typeof apiKey !== 'string') {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 400 });
    }

    // Validate API key format
    if (!apiKey.startsWith('sk-ant-')) {
      return NextResponse.json(
        { error: 'מפתח API לא תקין. המפתח צריך להתחיל ב-sk-ant-' },
        { status: 400 }
      );
    }

    // Encrypt the API key
    const encryptedKey = encrypt(apiKey);

    // Save to database
    await prisma.setting.upsert({
      where: { key: 'anthropic_api_key' },
      update: { value: encryptedKey },
      create: { key: 'anthropic_api_key', value: encryptedKey },
    });

    return NextResponse.json({
      success: true,
      maskedKey: maskApiKey(apiKey),
    });
  } catch (error) {
    console.error('Save API key error:', error);
    return NextResponse.json({ error: 'Failed to save API key' }, { status: 500 });
  }
}

// DELETE - Remove API key
export async function DELETE() {
  try {
    await prisma.setting.delete({
      where: { key: 'anthropic_api_key' },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete API key error:', error);
    return NextResponse.json({ success: true }); // Don't error if not found
  }
}
