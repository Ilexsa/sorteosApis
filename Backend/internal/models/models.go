package models

import "time"

type Person struct {
	ID    int    `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
}

type Prize struct {
	ID          int    `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

type WinnerRecord struct {
	ID        int       `json:"id"`
	Person    Person    `json:"person"`
	Prize     Prize     `json:"prize"`
	AwardedAt time.Time `json:"awardedAt"`
}

type RaffleState struct {
	RemainingPeople int            `json:"remainingPeople"`
	RemainingPrizes int            `json:"remainingPrizes"`
	RecentWinners   []WinnerRecord `json:"recentWinners"`
	UpcomingPrizes  []Prize        `json:"upcomingPrizes"`
	WaitingPeople   []Person       `json:"waitingPeople"`
}
