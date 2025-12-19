package raffle

import (
	"context"
	"sync"
	"time"

	"apiSorteos/internal/models"
	"apiSorteos/internal/repository"
)

type Service struct {
	repo      repository.Repository
	clientsMu sync.Mutex
	clients   map[*Client]struct{}
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
	people, err := s.repo.ListParticipants(ctx)
	if err != nil {
		return models.RaffleState{}, err
	}

	prizes, err := s.repo.ListPrizes(ctx)
	if err != nil {
		return models.RaffleState{}, err
	}

	winners, err := s.repo.ListRecentWinners(ctx, 5)
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
	SelectedPrize   models.Prize   `json:"selectedPrize"`
	SelectedPerson  models.Person  `json:"selectedPerson"`
	Segments        []models.Prize `json:"segments"`
	RemainingPeople int            `json:"remainingPeople"`
	RemainingPrizes int            `json:"remainingPrizes"`
}

func (s *Service) RegisterSpin(ctx context.Context, participantID, prizeID int) (models.WinnerRecord, error) {
	if participantID == 0 || prizeID == 0 {
		return models.WinnerRecord{}, repository.ErrNothingToRegister
	}

	people, err := s.repo.ListParticipants(ctx)
	if err != nil {
		return models.WinnerRecord{}, err
	}

	prizes, err := s.repo.ListPrizes(ctx)
	if err != nil {
		return models.WinnerRecord{}, err
	}

	var person models.Person
	for _, p := range people {
		if p.ID == participantID {
			person = p
			break
		}
	}
	if person.ID == 0 {
		return models.WinnerRecord{}, repository.ErrParticipantUsed
	}

	var prize models.Prize
	for _, pr := range prizes {
		if pr.ID == prizeID {
			prize = pr
			break
		}
	}
	if prize.ID == 0 {
		return models.WinnerRecord{}, repository.ErrPrizeUnavailable
	}

	spin := SpinEnvelope{
		StartedAt:       time.Now().UTC(),
		SelectedPrize:   prize,
		SelectedPerson:  person,
		Segments:        append([]models.Prize(nil), prizes...),
		RemainingPeople: len(people),
		RemainingPrizes: len(prizes),
	}
	s.broadcast(Event{Type: "spin-start", Data: spin})

	record, err := s.repo.SaveAward(ctx, participantID, prizeID)
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
