package raffle

import (
	"context"
	"sync"

	"apiSorteos/internal/models"
	"apiSorteos/internal/repository"
)

type Service struct {
	repo    repository.Repository
	mu      sync.Mutex
	clients map[*Client]struct{}
}

type Client struct {
	ch   chan Event
	done chan struct{}
}

func (c *Client) Chan() <-chan Event {
	return c.ch
}

type Event struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

func NewService(repo repository.Repository) *Service {
	return &Service{
		repo:    repo,
		clients: map[*Client]struct{}{},
	}
}

func (s *Service) RegisterClient() *Client {
	s.mu.Lock()
	defer s.mu.Unlock()
	client := &Client{ch: make(chan Event, 4), done: make(chan struct{})}
	s.clients[client] = struct{}{}
	client.ch <- Event{Type: "state", Data: s.State(context.Background())}
	return client
}

func (s *Service) UnregisterClient(c *Client) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.clients[c]; ok {
		delete(s.clients, c)
		close(c.ch)
		close(c.done)
	}
}

func (s *Service) broadcast(evt Event) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for c := range s.clients {
		select {
		case c.ch <- evt:
		default:
		}
	}
}

func (s *Service) State(ctx context.Context) models.RaffleState {
	people, prizes, winners, err := s.repo.Snapshot(ctx)
	if err != nil {
		return models.RaffleState{}
	}
	return models.RaffleState{
		RemainingPeople: len(people),
		RemainingPrizes: len(prizes),
		RecentWinners:   winners,
		UpcomingPrizes:  prizes,
		WaitingPeople:   people,
	}
}

func (s *Service) Draw(ctx context.Context) (models.WinnerRecord, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	record, err := s.repo.DrawRandom(ctx)
	if err != nil {
		return models.WinnerRecord{}, err
	}

	state := s.State(ctx)
	s.broadcast(Event{Type: "winner", Data: record})
	s.broadcast(Event{Type: "state", Data: state})

	return record, nil
}
