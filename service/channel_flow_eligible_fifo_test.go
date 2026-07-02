package service

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestMemoryFlowBackendEligibleFIFODoesNotBlockSpareCapacity(t *testing.T) {
	backend := NewMemoryFlowBackend()
	pool := testFlowPool()
	pool.MaxInflight = 2
	pool.MaxInflightPerUser = 1
	pool.MaxQueueSize = 5
	pool.QueueTimeoutMs = 1000

	guardA1, _, err := backend.Acquire(context.Background(), AcquireRequest{
		RequestID: "eligible-fifo-memory-a-1",
		Pool:      pool,
		UserID:    1,
	})
	require.NoError(t, err)
	defer guardA1.Release(context.Background())

	a2Done := make(chan error, 1)
	go func() {
		_, _, err := backend.Acquire(context.Background(), AcquireRequest{
			RequestID:      "eligible-fifo-memory-a-2",
			Pool:           pool,
			UserID:         1,
			QueueTimeoutMs: 1000,
		})
		a2Done <- err
	}()
	eventuallyFlowStatus(t, backend, pool, func(status PoolStatus) bool {
		return status.Running == 1 && status.Queued == 1
	})

	guardB, decisionB, err := backend.Acquire(context.Background(), AcquireRequest{
		RequestID: "eligible-fifo-memory-b-1",
		Pool:      pool,
		UserID:    2,
	})
	require.NoError(t, err)
	require.NotNil(t, guardB)
	require.True(t, decisionB.Admitted)
	defer guardB.Release(context.Background())

	status, err := backend.Status(context.Background(), pool)
	require.NoError(t, err)
	require.Equal(t, 2, status.Running)
	require.Equal(t, 1, status.Queued)

	select {
	case <-a2Done:
		t.Fatal("A's queued request should still be blocked while A is at the per-user inflight limit")
	case <-time.After(50 * time.Millisecond):
	}
}

func TestRedisFlowBackendEligibleFIFODoesNotBlockSpareCapacity(t *testing.T) {
	backend, pool, cleanup := newRedisFlowBackendForTest(t)
	defer cleanup()
	pool.MaxInflight = 2
	pool.MaxInflightPerUser = 1
	pool.MaxQueueSize = 5
	pool.QueueTimeoutMs = 1000
	pool.LeaseMs = 5000

	guardA1, _, err := backend.Acquire(context.Background(), AcquireRequest{
		RequestID: "eligible-fifo-redis-a-1",
		Pool:      pool,
		UserID:    1,
	})
	require.NoError(t, err)
	defer guardA1.Release(context.Background())

	a2Done := make(chan error, 1)
	go func() {
		_, _, err := backend.Acquire(context.Background(), AcquireRequest{
			RequestID:      "eligible-fifo-redis-a-2",
			Pool:           pool,
			UserID:         1,
			QueueTimeoutMs: 1000,
		})
		a2Done <- err
	}()
	eventuallyFlowStatus(t, backend, pool, func(status PoolStatus) bool {
		return status.Running == 1 && status.Queued == 1
	})

	guardB, decisionB, err := backend.Acquire(context.Background(), AcquireRequest{
		RequestID: "eligible-fifo-redis-b-1",
		Pool:      pool,
		UserID:    2,
	})
	require.NoError(t, err)
	require.NotNil(t, guardB)
	require.True(t, decisionB.Admitted)
	defer guardB.Release(context.Background())

	eventuallyFlowStatus(t, backend, pool, func(status PoolStatus) bool {
		return status.Running == 2 && status.Queued == 1
	})

	select {
	case <-a2Done:
		t.Fatal("A's queued request should still be blocked while A is at the per-user inflight limit")
	case <-time.After(50 * time.Millisecond):
	}
}
