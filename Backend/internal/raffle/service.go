package raffle

import (
	"context"
	"errors"
	"math/rand"
	"sync"
	"time"

	"apiSorteos/internal/models"
	"apiSorteos/internal/repository"
)

type Service struct {
	repo      repository.Repository
	clientsMu sync.Mutex
	drawMu    sync.Mutex
	clients   map[*Client]struct{}
	rng       *rand.Rand
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
		rng:     rand.New(rand.NewSource(time.Now().UnixNano())),
	}
}

func (s *Service) RegisterClient() *Client {
	client := &Client{ch: make(chan Event, 4), done: make(chan struct{})}
	s.clientsMu.Lock()
	s.clients[client] = struct{}{}
	s.clientsMu.Unlock()

	if state, err := s.State(context.Background()); err == nil {
		client.ch <- Event{Type: "state", Data: state}
	} else {
		client.ch <- Event{Type: "error", Data: err.Error()}
	}

	return client
}

func (s *Service) UnregisterClient(c *Client) {
	s.clientsMu.Lock()
	defer s.clientsMu.Unlock()
	if _, ok := s.clients[c]; ok {
		delete(s.clients, c)
		close(c.ch)
		close(c.done)
	}
}

func (s *Service) broadcast(evt Event) {
	s.clientsMu.Lock()
	defer s.clientsMu.Unlock()
	for c := range s.clients {
		select {
		case c.ch <- evt:
		default:
		}
	}
}

func (s *Service) State(ctx context.Context) (models.RaffleState, error) {
	people, prizes, winners, err := s.repo.Snapshot(ctx)
	if err != nil {
		return models.RaffleState{}, err
	}
	return models.RaffleState{
		RemainingPeople: len(people),
		RemainingPrizes: len(prizes),
		RecentWinners:   winners,
		UpcomingPrizes:  prizes,
		WaitingPeople:   people,
	}, nil
}

type SpinEnvelope struct {
	StartedAt       time.Time      `json:"startedAt"`
	TargetPrize     models.Prize   `json:"targetPrize"`
	Segments        []models.Prize `json:"segments"`
	RemainingPeople int            `json:"remainingPeople"`
	RemainingPrizes int            `json:"remainingPrizes"`
}

func (s *Service) Draw(ctx context.Context, prizeID int) (models.WinnerRecord, error) {
	s.drawMu.Lock()
	defer s.drawMu.Unlock()

	people, prizes, _, err := s.repo.Snapshot(ctx)
	if err != nil {
		return models.WinnerRecord{}, err
	}
	if len(people) == 0 {
		return models.WinnerRecord{}, repository.ErrNoParticipants
	}
	if len(prizes) == 0 {
		return models.WinnerRecord{}, repository.ErrNoPrizes
	}

	targetPrize, err := s.pickPrize(prizes, prizeID)
	if err != nil {
		return models.WinnerRecord{}, err
	}

	spin := SpinEnvelope{
		StartedAt:       time.Now().UTC(),
		TargetPrize:     targetPrize,
		Segments:        append([]models.Prize(nil), prizes...),
		RemainingPeople: len(people),
		RemainingPrizes: len(prizes),
	}
	s.broadcast(Event{Type: "spin-start", Data: spin})

	record, err := s.repo.Draw(ctx, targetPrize.ID)
	if err != nil {
		s.broadcast(Event{Type: "error", Data: err.Error()})
		return models.WinnerRecord{}, err
	}

	s.broadcast(Event{Type: "spin-complete", Data: record})
	if state, err := s.State(ctx); err == nil {
		s.broadcast(Event{Type: "state", Data: state})
	} else {
		s.broadcast(Event{Type: "error", Data: err.Error()})
	}

	return record, nil
}

func (s *Service) pickPrize(prizes []models.Prize, prizeID int) (models.Prize, error) {
	if len(prizes) == 0 {
		return models.Prize{}, repository.ErrNoPrizes
	}
	if prizeID > 0 {
		for _, prize := range prizes {
			if prize.ID == prizeID {
				return prize, nil
			}
		}
		return models.Prize{}, repository.ErrPrizeUnavailable
	}
	if len(prizes) == 1 {
		return prizes[0], nil
	}
	index := s.rng.Intn(len(prizes))
	if index < 0 || index >= len(prizes) {
		return models.Prize{}, errors.New("índice de premio inválido")
	}
	return prizes[index], nil
}
