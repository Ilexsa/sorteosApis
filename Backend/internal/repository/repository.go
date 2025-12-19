package repository

import (
	"context"
	"errors"

	"apiSorteos/internal/models"
)

var (
	ErrNoParticipants       = errors.New("no hay personas disponibles")
	ErrNoPrizes             = errors.New("no hay premios disponibles")
	ErrParticipantUsed      = errors.New("el participante seleccionado ya no está disponible")
	ErrPrizeUnavailable     = errors.New("el premio solicitado ya no está disponible")
	ErrNothingToRegister    = errors.New("no se pudo registrar el premio porque faltan datos")
	ErrRecentWinnersInvalid = errors.New("el límite de ganadores recientes no es válido")
)

type Repository interface {
	ListParticipants(ctx context.Context) ([]models.Person, error)
	ListPrizes(ctx context.Context) ([]models.Prize, error)
	ListRecentWinners(ctx context.Context, limit int) ([]models.WinnerRecord, error)
	SaveAward(ctx context.Context, participantID, prizeID int) (models.WinnerRecord, error)
}
