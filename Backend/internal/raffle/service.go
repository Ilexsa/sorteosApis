package raffle

import (
	"errors"
	"math/rand"
	"sync"
	"time"

	"apiSorteos/internal/models"
	"apiSorteos/internal/repository"
)

var (
	ErrNoParticipants = errors.New("no hay personas disponibles para el sorteo")
	ErrNoPrizes       = errors.New("no hay premios disponibles para el sorteo")
)

type Service struct {
	repo    *repository.InMemoryRepository
	rand    *rand.Rand
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

func NewService(repo *repository.InMemoryRepository) *Service {
	return &Service{
		repo:    repo,
		rand:    rand.New(rand.NewSource(time.Now().UnixNano())),
		clients: map[*Client]struct{}{},
	}
}

func (s *Service) RegisterClient() *Client {
	s.mu.Lock()
	defer s.mu.Unlock()
	client := &Client{ch: make(chan Event, 4), done: make(chan struct{})}
	s.clients[client] = struct{}{}
	client.ch <- Event{Type: "state", Data: s.State()}
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

func (s *Service) State() models.RaffleState {
	people, prizes, winners := s.repo.Snapshot()
	return models.RaffleState{
		RemainingPeople: len(people),
		RemainingPrizes: len(prizes),
		RecentWinners:   winners,
		UpcomingPrizes:  prizes,
		WaitingPeople:   people,
	}
}

func (s *Service) Draw() (models.WinnerRecord, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	people := s.repo.ListPeople()
	prizes := s.repo.ListPrizes()
	if len(people) == 0 {
		return models.WinnerRecord{}, ErrNoParticipants
	}
	if len(prizes) == 0 {
		return models.WinnerRecord{}, ErrNoPrizes
	}

	personIdx := s.rand.Intn(len(people))
	prizeIdx := s.rand.Intn(len(prizes))

	person, ok := s.repo.PopPerson(personIdx)
	if !ok {
		return models.WinnerRecord{}, ErrNoParticipants
	}
	prize, ok := s.repo.PopPrize(prizeIdx)
	if !ok {
		return models.WinnerRecord{}, ErrNoPrizes
	}

	record := models.WinnerRecord{
		Person:    person,
		Prize:     prize,
		AwardedAt: time.Now(),
	}
	record = s.repo.SaveWinner(record)

	state := s.State()
	s.broadcast(Event{Type: "winner", Data: record})
	s.broadcast(Event{Type: "state", Data: state})

	return record, nil
}
