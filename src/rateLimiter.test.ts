import { createRateLimiter, allowRequest, getBucketState } from './rateLimiter';

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
});
