package repository

import (
	"context"
	"errors"

	"apiSorteos/internal/models"
)

var (
	ErrNoParticipants   = errors.New("no hay personas disponibles para el sorteo")
	ErrNoPrizes         = errors.New("no hay premios disponibles para el sorteo")
	ErrPrizeUnavailable = errors.New("el premio solicitado no está disponible")
)

type Repository interface {
	Snapshot(ctx context.Context) ([]models.Person, []models.Prize, []models.WinnerRecord, error)
	Draw(ctx context.Context, prizeID int) (models.WinnerRecord, error)
}
