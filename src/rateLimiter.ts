import { RateLimiter, UserBucket, BucketState, AllowRequestResult } from './types';

export function createRateLimiter(capacity: number, leakRate: number): RateLimiter {
  if (capacity <= 0) {
    throw new Error('Capacity must be positive');
  }
  if (leakRate <= 0) {
    throw new Error('Leak rate must be positive');
  }

  return {
    capacity,
    leakRate,
    buckets: new Map<string, UserBucket>(),
  };
}

function calculateLeakedLevel(bucket: UserBucket, currentTime: number, leakRate: number): number {
  const timeElapsed = Math.max(0, currentTime - bucket.lastUpdateTime);
  const leakedAmount = timeElapsed * leakRate;
  return Math.max(0, bucket.currentLevel - leakedAmount);
}

function updateBucket(bucket: UserBucket, currentTime: number, leakRate: number): UserBucket {
  const newLevel = calculateLeakedLevel(bucket, currentTime, leakRate);
  return {
    currentLevel: newLevel,
    lastUpdateTime: Math.max(bucket.lastUpdateTime, currentTime),
  };
}

export function allowRequest(limiter: RateLimiter, userId: string, timestamp: number): AllowRequestResult {
  if (!userId || userId.trim() === '') {
    throw new Error('User ID must be a non-empty string');
  }

  if (!isFinite(timestamp)) {
    throw new Error('Timestamp must be a finite number');
  }

  const existingBucket = limiter.buckets.get(userId);

  let currentBucket: UserBucket;
  if (!existingBucket) {
    currentBucket = {
      currentLevel: 0,
      lastUpdateTime: timestamp,
    };
  } else {
    currentBucket = updateBucket(existingBucket, timestamp, limiter.leakRate);
  }

  const newLevelAfterRequest = currentBucket.currentLevel + 1;

  if (newLevelAfterRequest > limiter.capacity) {
    const newBuckets = new Map(limiter.buckets);
    newBuckets.set(userId, currentBucket);

    return [false, { ...limiter, buckets: newBuckets }];
  }

  const updatedBucket: UserBucket = {
    currentLevel: newLevelAfterRequest,
    lastUpdateTime: currentBucket.lastUpdateTime,
  };

  const newBuckets = new Map(limiter.buckets);
  newBuckets.set(userId, updatedBucket);

  return [true, { ...limiter, buckets: newBuckets }];
}

export function getBucketState(limiter: RateLimiter, userId: string): BucketState | null {
  if (!userId || userId.trim() === '') {
    return null;
  }

  const bucket = limiter.buckets.get(userId);
  if (!bucket) {
    return null;
  }

  return {
    userId,
    currentLevel: bucket.currentLevel,
    capacity: limiter.capacity,
    lastUpdateTime: bucket.lastUpdateTime,
    leakRate: limiter.leakRate,
  };
}