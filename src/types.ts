export interface UserBucket {
  currentLevel: number;
  lastUpdateTime: number;
}

export interface RateLimiter {
  capacity: number;
  leakRate: number;
  buckets: Map<string, UserBucket>;
}

export interface BucketState {
  userId: string;
  currentLevel: number;
  capacity: number;
  lastUpdateTime: number;
  leakRate: number;
}

export type AllowRequestResult = [boolean, RateLimiter];
