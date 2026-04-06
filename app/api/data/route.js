import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';
import { getDefaultData } from '@/lib/data';

const DATA_KEY = 'buddy_system_data';

function getRedis() {
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
  });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const isRotaOnly = searchParams.get('rota') === '1';

  // Read-only buddy cover — no password needed
  if (searchParams.get('buddy') === '1') {
    try {
      const redis = getRedis();
      let data = await redis.get(DATA_KEY);
      if (!data) data = getDefaultData();
      return NextResponse.json({
        clinicians: data.clinicians,
        plannedAbsences: data.plannedAbsences || [],
        allocationHistory: data.allocationHistory || {},
        weeklyRota: data.weeklyRota || {},
        settings: data.settings,
        dailyOverrides: data.dailyOverrides || {},
        closedDays: data.closedDays || {},
        _readOnly: true,
      });
    } catch (error) {
      const d = getDefaultData();
      return NextResponse.json({ clinicians: d.clinicians, _readOnly: true });
    }
  }

  // Read-only rota access — no password needed, returns filtered data
  if (isRotaOnly) {
    try {
      const redis = getRedis();
      let data = await redis.get(DATA_KEY);
      if (!data) data = getDefaultData();
      // Return only what My Rota needs
      return NextResponse.json({
        clinicians: data.clinicians,
        plannedAbsences: data.plannedAbsences || [],
        allocationHistory: data.allocationHistory || {},
        weeklyRota: data.weeklyRota || {},
        huddleSettings: { dutyDoctorSlot: data.huddleSettings?.dutyDoctorSlot },
        huddleCsvData: data.huddleCsvData || null,
        settings: data.settings,
        dailyOverrides: data.dailyOverrides || {},
        _readOnly: true,
      });
    } catch (error) {
      const d = getDefaultData();
      return NextResponse.json({ clinicians: d.clinicians, _readOnly: true });
    }
  }

  // Full access — requires password
  const password = request.headers.get('x-password');
  if (password !== process.env.APP_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const redis = getRedis();
    let data = await redis.get(DATA_KEY);
    
    if (!data) {
      data = getDefaultData();
      await redis.set(DATA_KEY, data);
    }
    
    return NextResponse.json(data);
  } catch (error) {
    // If Redis is not configured, return default data
    console.error('Redis Error:', error);
    return NextResponse.json(getDefaultData());
  }
}

export async function POST(request) {
  // Check password
  const password = request.headers.get('x-password');
  if (password !== process.env.APP_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const redis = getRedis();
    const data = await request.json();
    await redis.set(DATA_KEY, data);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Redis Error:', error);
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }
}
