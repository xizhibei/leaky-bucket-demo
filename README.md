# Leaky Bucket Rate Limiter

A TypeScript implementation of a rate limiter using the leaky bucket algorithm. Each user has their own bucket with a fixed capacity that "leaks" at a constant rate over time.

## What is a Leaky Bucket?

The **Leaky Bucket** algorithm is a rate limiting technique that smooths out bursty traffic by maintaining a bucket that:

1. **Fills** with incoming requests (each request adds 1 unit)
2. **Leaks** at a constant rate over time (configurable leak rate)
3. **Rejects** requests when the bucket would overflow its capacity

Think of it like a physical bucket with a small hole at the bottom:

- Water (requests) pours in at various rates
- Water leaks out at a steady, constant rate
- If you pour too fast, the bucket overflows and excess water is discarded

### Key Characteristics

- **Smooth traffic flow**: Handles bursts by allowing temporary spikes within capacity
- **Predictable resource usage**: The leak rate determines maximum long-term throughput
- **Memory of past activity**: Recent activity affects current request handling
- **Gradual recovery**: The bucket naturally empties over time when traffic decreases

## Rate Limiting Algorithm Comparison

| Algorithm          | Burst Handling                   | Memory Usage                | Implementation | Use Case                                   |
| ------------------ | -------------------------------- | --------------------------- | -------------- | ------------------------------------------ |
| **Leaky Bucket**   | ✅ Allows bursts up to capacity  | 🟡 Per-user state           | 🟡 Moderate    | Smooth traffic, predictable resource usage |
| **Token Bucket**   | ✅ Allows bursts, refills tokens | 🟡 Per-user state           | 🟡 Moderate    | API rate limiting, credit-based systems    |
| **Fixed Window**   | ❌ Hard reset every window       | 🟢 Minimal                  | 🟢 Simple      | Basic quotas, simple traffic limiting      |
| **Sliding Window** | 🟡 Smooths window boundaries     | 🔴 High (stores timestamps) | 🔴 Complex     | Precise rate limiting, analytics           |

### When to Choose Leaky Bucket

**✅ Choose Leaky Bucket when:**

- You need to handle traffic bursts gracefully
- Resource consumption should be predictable over time
- You want smooth traffic flow to downstream services
- Memory usage for per-user state is acceptable

**❌ Consider alternatives when:**

- You need precise per-second limits (use Token Bucket)
- Memory usage must be minimal (use Fixed Window)
- You need detailed traffic analytics (use Sliding Window)
- Bursts should be completely prevented (use Token Bucket with low capacity)

### Algorithm Comparison Example

With a limit of 5 requests per 5 seconds:

```
Time:     0  1  2  3  4  5  6  7  8  9  10
Requests: 5  0  0  0  0  3  0  0  0  0  2

Fixed Window:     ✅✅✅✅✅ | ❌❌  ✅✅✅ | ❌❌
Token Bucket:     ✅✅✅✅✅ ✅✅✅  ❌❌❌ ✅✅
Leaky Bucket:     ✅✅✅✅✅ ✅✅✅  ❌❌❌ ✅✅
Sliding Window:   ✅✅✅✅✅ ❌❌❌  ✅✅✅ ✅✅
```

**Leaky Bucket behavior:**

- Burst of 5 at t=0: All allowed, bucket full
- Requests at t=5-6: Allowed (bucket leaked to capacity 2-3)
- Requests at t=7-8: Rejected (bucket still too full)
- Requests at t=10: Allowed (bucket leaked enough space)

## Installation

```bash
pnpm install
```

## Usage

```typescript
import { createRateLimiter, allowRequest, getBucketState } from './src';

// Create a rate limiter with capacity=5, leak_rate=1.0 per second
const limiter = createRateLimiter(5, 1.0);

// Check if a request is allowed
const [allowed, newLimiter] = allowRequest(limiter, 'user1', Date.now() / 1000);

// Get current bucket state for debugging
const bucketState = getBucketState(newLimiter, 'user1');
```

## API

### `createRateLimiter(capacity: number, leakRate: number): RateLimiter`

Creates a new rate limiter with specified capacity and leak rate per second.

### `allowRequest(limiter: RateLimiter, userId: string, timestamp: number): [boolean, RateLimiter]`

Determines if a request should be allowed and returns the new limiter state.

### `getBucketState(limiter: RateLimiter, userId: string): BucketState | null`

Returns current bucket information for debugging purposes.

## Design Decisions

### Functional Approach

- Immutable data structures with functional updates
- No mutation of existing state
- Pure functions with predictable behavior

### Time-based Leaking

- Buckets leak based on elapsed time since last update
- Supports fractional timestamps and leak rates
- Handles edge cases like backwards timestamps

### Per-user Buckets

- Each user ID gets independent bucket tracking
- Efficient Map-based storage
- Automatic bucket creation on first request

## Edge Cases Handled

- **New users**: Buckets created automatically on first request
- **Backwards timestamps**: Uses max(current_time, last_update) to prevent time travel
- **Large time gaps**: Prevents bucket underflow with proper bounds checking
- **Overflow scenarios**: Rejects requests without modifying bucket state
- **Invalid inputs**: Proper error handling for malformed user IDs and timestamps

## Testing

```bash
# Run tests
pnpm test

# Run tests with coverage
pnpm test -- --coverage

# Run tests in watch mode
pnpm test:watch
```

## Building

```bash
# Build TypeScript to JavaScript
pnpm build

# Clean build artifacts
pnpm clean
```

## Development

```bash
# Type check
pnpm typecheck

# Lint code
pnpm lint

# Auto-fix linting issues
pnpm lint:fix

# Format code
pnpm format

# Check formatting
pnpm format:check

# Run all quality checks
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
```

### Pre-commit Hooks

This project uses Husky and lint-staged to automatically run quality checks before commits:

- **Prettier**: Formats all code automatically
- **ESLint**: Fixes linting issues and enforces code standards
- **TypeScript**: Validates types and catches errors
- **Tests**: Ensures all functionality works correctly

The pre-commit hook will prevent commits if any checks fail, ensuring code quality.
