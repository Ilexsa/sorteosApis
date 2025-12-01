package repository

import (
	"context"
	"math/rand"
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

func (r *InMemoryRepository) Snapshot(_ context.Context) ([]models.Person, []models.Prize, []models.WinnerRecord, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	people := make([]models.Person, len(r.people))
	copy(people, r.people)
	prizes := make([]models.Prize, len(r.prizes))
	copy(prizes, r.prizes)
	winners := make([]models.WinnerRecord, len(r.winners))
	copy(winners, r.winners)
	return people, prizes, winners, nil
}

func (r *InMemoryRepository) DrawRandom(_ context.Context) (models.WinnerRecord, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if len(r.people) == 0 {
		return models.WinnerRecord{}, ErrNoParticipants
	}
	if len(r.prizes) == 0 {
		return models.WinnerRecord{}, ErrNoPrizes
	}

	personIdx := rand.Intn(len(r.people))
	prizeIdx := rand.Intn(len(r.prizes))

	person := r.people[personIdx]
	r.people = append(r.people[:personIdx], r.people[personIdx+1:]...)

	prize := r.prizes[prizeIdx]
	r.prizes = append(r.prizes[:prizeIdx], r.prizes[prizeIdx+1:]...)

	record := models.WinnerRecord{
		ID:        r.nextWinnerID,
		Person:    person,
		Prize:     prize,
		AwardedAt: time.Now(),
	}
	r.nextWinnerID++
	r.winners = append([]models.WinnerRecord{record}, r.winners...)
	if len(r.winners) > 5 {
		r.winners = r.winners[:5]
	}
	return record, nil
}
