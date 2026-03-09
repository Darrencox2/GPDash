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
  // Check password
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
