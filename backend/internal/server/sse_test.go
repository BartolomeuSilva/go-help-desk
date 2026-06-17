package server

import (
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestSSEBroadcastDeliversToSubscriber(t *testing.T) {
	b := NewSSEBroker()
	id := uuid.New()

	ch := b.Subscribe(id)
	defer b.Unsubscribe(id, ch)

	b.Broadcast(id, "refresh", "")

	select {
	case msg := <-ch:
		if !strings.HasPrefix(msg, "event: refresh\n") {
			t.Errorf("missing event line: %q", msg)
		}
		// Empty input must still produce a non-empty data field.
		if strings.Contains(msg, "data: \n") || strings.Contains(msg, "data:\n") {
			t.Errorf("data field is empty: %q", msg)
		}
		if !strings.HasSuffix(msg, "\n\n") {
			t.Errorf("frame not terminated by blank line: %q", msg)
		}
	default:
		t.Fatal("subscriber received no message")
	}
}

func TestSSEBroadcastToMultipleSubscribers(t *testing.T) {
	b := NewSSEBroker()
	id := uuid.New()

	ch1 := b.Subscribe(id)
	ch2 := b.Subscribe(id)
	defer b.Unsubscribe(id, ch1)
	defer b.Unsubscribe(id, ch2)

	b.Broadcast(id, "refresh", "payload")

	for i, ch := range []chan string{ch1, ch2} {
		select {
		case msg := <-ch:
			if !strings.Contains(msg, "data: payload\n") {
				t.Errorf("subscriber %d got wrong payload: %q", i, msg)
			}
		default:
			t.Errorf("subscriber %d received nothing", i)
		}
	}
}

func TestSSEBroadcastDoesNotBlockOnFullSubscriber(t *testing.T) {
	b := NewSSEBroker()
	id := uuid.New()

	// Subscribe but never drain — the channel will fill up.
	ch := b.Subscribe(id)
	defer b.Unsubscribe(id, ch)

	// More broadcasts than the channel buffer; must not deadlock/block.
	done := make(chan struct{})
	go func() {
		for i := 0; i < 100; i++ {
			b.Broadcast(id, "refresh", "")
		}
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("Broadcast blocked on a full subscriber channel")
	}
}

func TestSSEUnsubscribeClosesChannel(t *testing.T) {
	b := NewSSEBroker()
	id := uuid.New()

	ch := b.Subscribe(id)
	b.Unsubscribe(id, ch)

	if _, ok := <-ch; ok {
		t.Error("channel should be closed after Unsubscribe")
	}

	// Broadcasting to a ticket with no subscribers must be a safe no-op.
	b.Broadcast(id, "refresh", "")
}
