import {
  createRateLimiter,
  allowRequest,
  getBucketState,
  cleanupInactiveBuckets,
} from './rateLimiter';

describe('Rate Limiter', () => {
  describe('createRateLimiter', () => {
    test('creates a rate limiter with correct parameters', () => {
      const limiter = createRateLimiter(5, 1.0);
      expect(limiter.capacity).toBe(5);
      expect(limiter.leakRate).toBe(1.0);
      expect(limiter.buckets.size).toBe(0);
    });

    test('throws error for invalid capacity', () => {
      expect(() => createRateLimiter(0, 1.0)).toThrow('Capacity must be positive');
      expect(() => createRateLimiter(-1, 1.0)).toThrow('Capacity must be positive');
    });

    test('throws error for invalid leak rate', () => {
      expect(() => createRateLimiter(5, 0)).toThrow('Leak rate must be positive');
      expect(() => createRateLimiter(5, -1)).toThrow('Leak rate must be positive');
    });
  });

  describe('allowRequest - Basic Functionality', () => {
    test('allows first request from new user', () => {
      const limiter = createRateLimiter(5, 1.0);
      const [allowed, newLimiter] = allowRequest(limiter, 'user1', 0);

      expect(allowed).toBe(true);
      expect(newLimiter.buckets.get('user1')?.currentLevel).toBe(1);
      expect(newLimiter.buckets.get('user1')?.lastUpdateTime).toBe(0);
    });

    test('allows multiple requests within capacity', () => {
      let limiter = createRateLimiter(5, 1.0);

      for (let i = 1; i <= 5; i++) {
        const [allowed, newLimiter] = allowRequest(limiter, 'user1', 0);
        expect(allowed).toBe(true);
        expect(newLimiter.buckets.get('user1')?.currentLevel).toBe(i);
        limiter = newLimiter;
      }
    });

    test('rejects request when bucket is full', () => {
      const limiter = createRateLimiter(2, 1.0);

      const [allowed1, limiter1] = allowRequest(limiter, 'user1', 0);
      const [allowed2, limiter2] = allowRequest(limiter1, 'user1', 0);
      const [allowed3, limiter3] = allowRequest(limiter2, 'user1', 0);

      expect(allowed1).toBe(true);
      expect(allowed2).toBe(true);
      expect(allowed3).toBe(false);
      expect(limiter3.buckets.get('user1')?.currentLevel).toBe(2);
    });
  });

  describe('allowRequest - Time-based Leaking', () => {
    test('leaks bucket over time', () => {
      const limiter = createRateLimiter(5, 1.0);

      const [, limiter1] = allowRequest(limiter, 'user1', 0);
      const [, limiter2] = allowRequest(limiter1, 'user1', 0);
      expect(limiter2.buckets.get('user1')?.currentLevel).toBe(2);

      const [, limiter3] = allowRequest(limiter2, 'user1', 1.5);
      expect(limiter3.buckets.get('user1')?.currentLevel).toBeCloseTo(1.5);
    });

    test('allows request after sufficient time has passed', () => {
      const limiter = createRateLimiter(2, 1.0);

      const [, limiter1] = allowRequest(limiter, 'user1', 0);
      const [, limiter2] = allowRequest(limiter1, 'user1', 0);
      const [allowed3, limiter3] = allowRequest(limiter2, 'user1', 0);
      expect(allowed3).toBe(false);

      const [allowed4, limiter4] = allowRequest(limiter3, 'user1', 2);
      expect(allowed4).toBe(true);
      expect(limiter4.buckets.get('user1')?.currentLevel).toBe(1);
    });

    test('handles large time gaps correctly', () => {
      const limiter = createRateLimiter(5, 1.0);

      const [, limiter1] = allowRequest(limiter, 'user1', 0);
      const [, limiter2] = allowRequest(limiter1, 'user1', 0);
      const [, limiter3] = allowRequest(limiter2, 'user1', 0);
      expect(limiter3.buckets.get('user1')?.currentLevel).toBe(3);

      const [, limiter4] = allowRequest(limiter3, 'user1', 1000);
      expect(limiter4.buckets.get('user1')?.currentLevel).toBe(1);
    });
  });

  describe('allowRequest - Multiple Users', () => {
    test('maintains independent buckets for different users', () => {
      const limiter = createRateLimiter(2, 1.0);

      const [allowed1, limiter1] = allowRequest(limiter, 'user1', 0);
      const [allowed2, limiter2] = allowRequest(limiter1, 'user1', 0);
      const [allowed3, limiter3] = allowRequest(limiter2, 'user1', 0);

      expect(allowed1).toBe(true);
      expect(allowed2).toBe(true);
      expect(allowed3).toBe(false);

      const [allowed4, limiter4] = allowRequest(limiter3, 'user2', 0);
      const [allowed5, limiter5] = allowRequest(limiter4, 'user2', 0);

      expect(allowed4).toBe(true);
      expect(allowed5).toBe(true);
      expect(limiter5.buckets.get('user1')?.currentLevel).toBe(2);
      expect(limiter5.buckets.get('user2')?.currentLevel).toBe(2);
    });
  });

  describe('allowRequest - Edge Cases', () => {
    test('handles backwards timestamps', () => {
      const limiter = createRateLimiter(5, 1.0);

      const [, limiter1] = allowRequest(limiter, 'user1', 10);
      expect(limiter1.buckets.get('user1')?.lastUpdateTime).toBe(10);

      const [, limiter2] = allowRequest(limiter1, 'user1', 5);
      expect(limiter2.buckets.get('user1')?.lastUpdateTime).toBe(10);
      expect(limiter2.buckets.get('user1')?.currentLevel).toBe(2);
    });

    test('handles invalid user IDs', () => {
      const limiter = createRateLimiter(5, 1.0);

      expect(() => allowRequest(limiter, '', 0)).toThrow('User ID must be a non-empty string');
      expect(() => allowRequest(limiter, '   ', 0)).toThrow('User ID must be a non-empty string');
    });

    test('handles invalid timestamps', () => {
      const limiter = createRateLimiter(5, 1.0);

      expect(() => allowRequest(limiter, 'user1', Infinity)).toThrow(
        'Timestamp must be a finite number'
      );
      expect(() => allowRequest(limiter, 'user1', NaN)).toThrow(
        'Timestamp must be a finite number'
      );
    });

    test('handles zero timestamp correctly', () => {
      const limiter = createRateLimiter(5, 1.0);
      const [allowed, newLimiter] = allowRequest(limiter, 'user1', 0);

      expect(allowed).toBe(true);
      expect(newLimiter.buckets.get('user1')?.lastUpdateTime).toBe(0);
    });

    test('handles negative timestamps', () => {
      const limiter = createRateLimiter(5, 1.0);
      const [allowed, newLimiter] = allowRequest(limiter, 'user1', -10);

      expect(allowed).toBe(true);
      expect(newLimiter.buckets.get('user1')?.lastUpdateTime).toBe(-10);
    });
  });

  describe('getBucketState', () => {
    test('returns null for non-existent user', () => {
      const limiter = createRateLimiter(5, 1.0);
      const state = getBucketState(limiter, 'user1');
      expect(state).toBeNull();
    });

    test('returns correct state for existing user', () => {
      const limiter = createRateLimiter(5, 1.0);
      const [, newLimiter] = allowRequest(limiter, 'user1', 0);

      const state = getBucketState(newLimiter, 'user1');
      expect(state).toEqual({
        userId: 'user1',
        currentLevel: 1,
        capacity: 5,
        lastUpdateTime: 0,
        leakRate: 1.0,
      });
    });

    test('returns null for invalid user IDs', () => {
      const limiter = createRateLimiter(5, 1.0);

      expect(getBucketState(limiter, '')).toBeNull();
      expect(getBucketState(limiter, '   ')).toBeNull();
    });
  });

  describe('Burst Handling', () => {
    test('handles rapid requests correctly', () => {
      let limiter = createRateLimiter(3, 1.0);
      const results = [];

      for (let i = 0; i < 5; i++) {
        const [allowed, newLimiter] = allowRequest(limiter, 'user1', 0);
        results.push(allowed);
        limiter = newLimiter;
      }

      expect(results).toEqual([true, true, true, false, false]);
      expect(limiter.buckets.get('user1')?.currentLevel).toBe(3);
    });
  });

  describe('Fractional Values', () => {
    test('handles fractional leak rates', () => {
      const limiter = createRateLimiter(10, 0.5);

      const [, limiter1] = allowRequest(limiter, 'user1', 0);
      const [, limiter2] = allowRequest(limiter1, 'user1', 0);
      expect(limiter2.buckets.get('user1')?.currentLevel).toBe(2);

      const [, limiter3] = allowRequest(limiter2, 'user1', 1);
      expect(limiter3.buckets.get('user1')?.currentLevel).toBeCloseTo(2.5);
    });

    test('handles fractional timestamps', () => {
      const limiter = createRateLimiter(5, 1.0);

      const [, limiter1] = allowRequest(limiter, 'user1', 0.5);
      const [, limiter2] = allowRequest(limiter1, 'user1', 1.7);

      expect(limiter2.buckets.get('user1')?.currentLevel).toBeCloseTo(1);
    });
  });

  describe('Memory Management', () => {
    test('cleanupInactiveBuckets removes old inactive buckets', () => {
      const limiter = createRateLimiter(5, 1.0);

      const [, limiter1] = allowRequest(limiter, 'user1', 0);
      const [, limiter2] = allowRequest(limiter1, 'user2', 0);
      expect(limiter2.buckets.size).toBe(2);

      const cleanedLimiter = cleanupInactiveBuckets(limiter2, 3601, 3600);
      expect(cleanedLimiter.buckets.size).toBe(0);
    });

    test('cleanupInactiveBuckets preserves active buckets', () => {
      const limiter = createRateLimiter(5, 1.0);

      const [, limiter1] = allowRequest(limiter, 'user1', 1000);
      const [, limiter2] = allowRequest(limiter1, 'user2', 0);
      expect(limiter2.buckets.size).toBe(2);

      const cleanedLimiter = cleanupInactiveBuckets(limiter2, 1000, 900);
      expect(cleanedLimiter.buckets.size).toBe(1);
      expect(cleanedLimiter.buckets.has('user1')).toBe(true);
      expect(cleanedLimiter.buckets.has('user2')).toBe(false);
    });

    test('cleanupInactiveBuckets updates bucket levels based on current time', () => {
      const limiter = createRateLimiter(5, 1.0);

      const [, limiter1] = allowRequest(limiter, 'user1', 0);
      const [, limiter2] = allowRequest(limiter1, 'user1', 0);
      expect(limiter2.buckets.size).toBe(1);
      expect(limiter2.buckets.get('user1')?.currentLevel).toBe(2);

      const cleanedLimiter = cleanupInactiveBuckets(limiter2, 1.5, 3600);
      expect(cleanedLimiter.buckets.size).toBe(1);
      expect(cleanedLimiter.buckets.get('user1')?.currentLevel).toBeCloseTo(0.5);
    });

    test('should handle many users without excessive memory allocation', () => {
      let limiter = createRateLimiter(5, 1.0);
      const userCount = 1000;

      const start = performance.now();
      for (let i = 0; i < userCount; i++) {
        const [, newLimiter] = allowRequest(limiter, `user${i}`, 0);
        limiter = newLimiter;
      }
      const end = performance.now();

      expect(limiter.buckets.size).toBe(userCount);
      expect(end - start).toBeLessThan(5000);
    });
  });

  describe('getBucketState - Enhanced', () => {
    test('returns accurate current level with timestamp', () => {
      const limiter = createRateLimiter(5, 1.0);
      const [, newLimiter] = allowRequest(limiter, 'user1', 0);

      const stateAtTime0 = getBucketState(newLimiter, 'user1', 0);
      const stateAtTime2 = getBucketState(newLimiter, 'user1', 2);

      expect(stateAtTime0?.currentLevel).toBe(1);
      expect(stateAtTime2?.currentLevel).toBe(0);
    });

    test('returns stale level without timestamp parameter', () => {
      const limiter = createRateLimiter(5, 1.0);
      const [, newLimiter] = allowRequest(limiter, 'user1', 0);

      const staleState = getBucketState(newLimiter, 'user1');
      expect(staleState?.currentLevel).toBe(1);
    });
  });

  describe('Edge Cases and Precision', () => {
    test('handles very small leak rates without precision loss', () => {
      const limiter = createRateLimiter(1000, 0.000001);

      const [, limiter1] = allowRequest(limiter, 'user1', 0);
      const [, limiter2] = allowRequest(limiter1, 'user1', 1000000);

      expect(limiter2.buckets.get('user1')?.currentLevel).toBeCloseTo(1);
    });

    test('handles very large timestamps safely', () => {
      const limiter = createRateLimiter(5, 1.0);
      const largeTimestamp = Number.MAX_SAFE_INTEGER / 2;

      const [allowed, newLimiter] = allowRequest(limiter, 'user1', largeTimestamp);
      expect(allowed).toBe(true);
      expect(newLimiter.buckets.get('user1')?.lastUpdateTime).toBe(largeTimestamp);
    });

    test('handles concurrent requests at same timestamp', () => {
      let limiter = createRateLimiter(3, 1.0);
      const results = [];

      for (let i = 0; i < 5; i++) {
        const [allowed, newLimiter] = allowRequest(limiter, 'user1', 0);
        results.push(allowed);
        limiter = newLimiter;
      }

      expect(results).toEqual([true, true, true, false, false]);
    });

    test('handles malformed user IDs gracefully', () => {
      const limiter = createRateLimiter(5, 1.0);

      expect(() => allowRequest(limiter, '\0\x01\xFF', 0)).not.toThrow();
      expect(() => allowRequest(limiter, 'a'.repeat(1000), 0)).not.toThrow();
      expect(() => allowRequest(limiter, '你好世界🌍', 0)).not.toThrow();
    });

    test('maintains precision over extended time periods', () => {
      const limiter = createRateLimiter(100, 0.1);

      const [, limiter1] = allowRequest(limiter, 'user1', 0);
      const [, limiter2] = allowRequest(limiter1, 'user1', 0);
      expect(limiter2.buckets.get('user1')?.currentLevel).toBe(2);

      const [, limiter3] = allowRequest(limiter2, 'user1', 86400);
      const finalLevel = limiter3.buckets.get('user1')?.currentLevel;
      expect(finalLevel).toBeCloseTo(1, 5);
    });
  });

  describe('Real-world Scenarios', () => {
    test('handles realistic web traffic burst patterns', () => {
      let limiter = createRateLimiter(10, 2.0);
      let time = 0;

      for (let burst = 0; burst < 3; burst++) {
        for (let req = 0; req < 8; req++) {
          const [allowed, newLimiter] = allowRequest(limiter, 'user1', time);
          expect(allowed).toBe(true);
          limiter = newLimiter;
          time += 0.1;
        }

        time += 3;
        const [allowed, newLimiter] = allowRequest(limiter, 'user1', time);
        expect(allowed).toBe(true);
        limiter = newLimiter;
      }
    });

    test('handles long-running stability over simulated days', () => {
      let limiter = createRateLimiter(100, 1.0);
      let time = 0;
      const oneDay = 86400;

      for (let day = 0; day < 7; day++) {
        for (let hour = 0; hour < 24; hour++) {
          const requestsThisHour = Math.floor(Math.random() * 50) + 10;
          for (let req = 0; req < requestsThisHour; req++) {
            const [, newLimiter] = allowRequest(limiter, 'user1', time);
            limiter = newLimiter;
            time += (Math.random() * 3600) / requestsThisHour;
          }
        }
        time = (day + 1) * oneDay;
      }

      const finalState = getBucketState(limiter, 'user1', time);
      expect(finalState?.currentLevel).toBeGreaterThanOrEqual(0);
      expect(finalState?.lastUpdateTime).toBeGreaterThan(0);
    });
  });
});
