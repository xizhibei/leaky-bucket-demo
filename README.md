# Leaky Bucket Rate Limiter

A TypeScript implementation of a rate limiter using the leaky bucket algorithm. Each user has their own bucket with a fixed capacity that "leaks" at a constant rate over time.

## Installation

```bash
npm install
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
npm test

# Run tests with coverage
npm run test -- --coverage

# Run tests in watch mode
npm run test:watch
```

## Building

```bash
# Build TypeScript to JavaScript
npm run build

# Clean build artifacts
npm run clean
```

## Development

```bash
# Lint code
npm run lint
```
