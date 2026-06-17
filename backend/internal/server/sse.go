package server

import (
	"fmt"
	"strconv"
	"sync"
	"time"

	"github.com/google/uuid"
)

// SSEBroker manages subscriptions and broadcast messages for tickets in real-time.
type SSEBroker struct {
	mu          sync.Mutex
	subscribers map[uuid.UUID]map[chan string]bool
}

// NewSSEBroker constructs a new SSEBroker.
func NewSSEBroker() *SSEBroker {
	return &SSEBroker{
		subscribers: make(map[uuid.UUID]map[chan string]bool),
	}
}

// Subscribe returns a channel of SSE formatted strings for the given ticket ID.
func (b *SSEBroker) Subscribe(ticketID uuid.UUID) chan string {
	b.mu.Lock()
	defer b.mu.Unlock()

	ch := make(chan string, 10)
	if _, ok := b.subscribers[ticketID]; !ok {
		b.subscribers[ticketID] = make(map[chan string]bool)
	}
	b.subscribers[ticketID][ch] = true
	return ch
}

// Unsubscribe removes a channel from the ticket ID subscribers and closes it.
func (b *SSEBroker) Unsubscribe(ticketID uuid.UUID, ch chan string) {
	b.mu.Lock()
	defer b.mu.Unlock()

	if subs, ok := b.subscribers[ticketID]; ok {
		if _, exists := subs[ch]; exists {
			delete(subs, ch)
			close(ch)
		}
		if len(subs) == 0 {
			delete(b.subscribers, ticketID)
		}
	}
}

// Broadcast sends a message to all active subscribers of a specific ticket.
func (b *SSEBroker) Broadcast(ticketID uuid.UUID, eventType string, data string) {
	b.mu.Lock()
	defer b.mu.Unlock()

	// Never emit an empty data field: a bare "data:" line is an ambiguous SSE
	// frame that some proxies/polyfills mishandle. A monotonic timestamp also
	// keeps every frame unique, so nothing dedupes a "refresh" against a prior.
	if data == "" {
		data = strconv.FormatInt(time.Now().UnixNano(), 10)
	}

	message := fmt.Sprintf("event: %s\ndata: %s\n\n", eventType, data)

	if subs, ok := b.subscribers[ticketID]; ok {
		for ch := range subs {
			select {
			case ch <- message:
			default:
				// Avoid blocking the broadcaster if one subscriber is slow or blocked.
			}
		}
	}
}
