package repository

import (
	"sync"

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

func (r *InMemoryRepository) ListPeople() []models.Person {
	r.mu.Lock()
	defer r.mu.Unlock()
	people := make([]models.Person, len(r.people))
	copy(people, r.people)
	return people
}

func (r *InMemoryRepository) ListPrizes() []models.Prize {
	r.mu.Lock()
	defer r.mu.Unlock()
	prizes := make([]models.Prize, len(r.prizes))
	copy(prizes, r.prizes)
	return prizes
}

func (r *InMemoryRepository) PopPerson(index int) (models.Person, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if index < 0 || index >= len(r.people) {
		return models.Person{}, false
	}
	p := r.people[index]
	r.people = append(r.people[:index], r.people[index+1:]...)
	return p, true
}

func (r *InMemoryRepository) PopPrize(index int) (models.Prize, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if index < 0 || index >= len(r.prizes) {
		return models.Prize{}, false
	}
	p := r.prizes[index]
	r.prizes = append(r.prizes[:index], r.prizes[index+1:]...)
	return p, true
}

func (r *InMemoryRepository) SaveWinner(record models.WinnerRecord) models.WinnerRecord {
	r.mu.Lock()
	defer r.mu.Unlock()
	record.ID = r.nextWinnerID
	r.nextWinnerID++
	r.winners = append([]models.WinnerRecord{record}, r.winners...)
	if len(r.winners) > 5 {
		r.winners = r.winners[:5]
	}
	return record
}

func (r *InMemoryRepository) RecentWinners() []models.WinnerRecord {
	r.mu.Lock()
	defer r.mu.Unlock()
	winners := make([]models.WinnerRecord, len(r.winners))
	copy(winners, r.winners)
	return winners
}

func (r *InMemoryRepository) Remaining() (int, int) {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.people), len(r.prizes)
}

func (r *InMemoryRepository) Snapshot() ([]models.Person, []models.Prize, []models.WinnerRecord) {
	r.mu.Lock()
	defer r.mu.Unlock()
	people := make([]models.Person, len(r.people))
	copy(people, r.people)
	prizes := make([]models.Prize, len(r.prizes))
	copy(prizes, r.prizes)
	winners := make([]models.WinnerRecord, len(r.winners))
	copy(winners, r.winners)
	return people, prizes, winners
}
