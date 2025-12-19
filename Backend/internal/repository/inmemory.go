package repository

import (
	"context"
	"sync"
	"time"

	"apiSorteos/internal/models"
)

type InMemoryRepository struct {
	mu           sync.Mutex
	people       []models.Person
	prizes       []models.Prize
	winners      []models.WinnerRecord
	nextWinnerID int
}

func NewInMemoryRepository() *InMemoryRepository {
	return &InMemoryRepository{
		people:       samplePeople(),
		prizes:       samplePrizes(),
		winners:      []models.WinnerRecord{},
		nextWinnerID: 1,
	}
}

func samplePeople() []models.Person {
	return []models.Person{
		{ID: 1, Name: "Elena Navideña", Email: "elena@example.com"},
		{ID: 2, Name: "Carlos Duende", Email: "carlos@example.com"},
		{ID: 3, Name: "Lucía Brillante", Email: "lucia@example.com"},
		{ID: 4, Name: "Mateo Estrella", Email: "mateo@example.com"},
		{ID: 5, Name: "Valeria Copo", Email: "valeria@example.com"},
	}
}

func samplePrizes() []models.Prize {
	return []models.Prize{
		{ID: 1, Name: "Caja Sorpresa", Description: "Sorpresa festiva envuelta en rojo"},
		{ID: 2, Name: "Café Invernal", Description: "Kit de café con especias"},
		{ID: 3, Name: "Bufanda Polar", Description: "Bufanda bordada con copos"},
		{ID: 4, Name: "Chocolate Caliente", Description: "Set de tazas y chocolate"},
		{ID: 5, Name: "Luces de Hadas", Description: "Guirnalda LED cálida"},
	}
}

func (r *InMemoryRepository) ListParticipants(_ context.Context) ([]models.Person, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	people := make([]models.Person, len(r.people))
	copy(people, r.people)
	return people, nil
}

func (r *InMemoryRepository) ListPrizes(_ context.Context) ([]models.Prize, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	prizes := make([]models.Prize, len(r.prizes))
	copy(prizes, r.prizes)
	return prizes, nil
}

func (r *InMemoryRepository) ListRecentWinners(_ context.Context, limit int) ([]models.WinnerRecord, error) {
	if limit <= 0 {
		return nil, ErrRecentWinnersInvalid
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	if len(r.winners) < limit {
		limit = len(r.winners)
	}
	winners := make([]models.WinnerRecord, limit)
	copy(winners, r.winners[:limit])
	return winners, nil
}

func (r *InMemoryRepository) SaveAward(_ context.Context, participantID, prizeID int) (models.WinnerRecord, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if participantID == 0 || prizeID == 0 {
		return models.WinnerRecord{}, ErrNothingToRegister
	}

	var personIdx = -1
	for i, p := range r.people {
		if p.ID == participantID {
			personIdx = i
			break
		}
	}
	if personIdx == -1 {
		return models.WinnerRecord{}, ErrParticipantUsed
	}

	var prizeIdx = -1
	for i, pr := range r.prizes {
		if pr.ID == prizeID {
			prizeIdx = i
			break
		}
	}
	if prizeIdx == -1 {
		return models.WinnerRecord{}, ErrPrizeUnavailable
	}

	person := r.people[personIdx]
	prize := r.prizes[prizeIdx]

	r.people = append(r.people[:personIdx], r.people[personIdx+1:]...)
	r.prizes = append(r.prizes[:prizeIdx], r.prizes[prizeIdx+1:]...)

	record := models.WinnerRecord{
		ID:        r.nextWinnerID,
		Person:    person,
		Prize:     prize,
		AwardedAt: time.Now().UTC(),
	}
	r.nextWinnerID++
	r.winners = append([]models.WinnerRecord{record}, r.winners...)
	if len(r.winners) > 5 {
		r.winners = r.winners[:5]
	}
	return record, nil
}
