package repository

import (
	"context"
	"errors"

	"apiSorteos/internal/models"
)

var (
	ErrNoParticipants = errors.New("no hay personas disponibles para el sorteo")
	ErrNoPrizes       = errors.New("no hay premios disponibles para el sorteo")
)

type Repository interface {
	Snapshot(ctx context.Context) ([]models.Person, []models.Prize, []models.WinnerRecord, error)
	DrawRandom(ctx context.Context) (models.WinnerRecord, error)
}
