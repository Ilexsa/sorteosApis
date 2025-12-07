package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"apiSorteos/internal/models"

	_ "github.com/denisenkom/go-mssqldb"
)

type SQLServerRepository struct {
	db *sql.DB
}

func NewSQLServerRepository(db *sql.DB) *SQLServerRepository {
	return &SQLServerRepository{db: db}
}

func (r *SQLServerRepository) Snapshot(ctx context.Context) ([]models.Person, []models.Prize, []models.WinnerRecord, error) {
	people, err := r.availablePeople(ctx)
	if err != nil {
		return nil, nil, nil, err
	}
	prizes, err := r.availablePrizes(ctx)
	if err != nil {
		return nil, nil, nil, err
	}
	winners, err := r.recentWinners(ctx, 5)
	if err != nil {
		return nil, nil, nil, err
	}
	return people, prizes, winners, nil
}

func (r *SQLServerRepository) DrawRandom(ctx context.Context) (models.WinnerRecord, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return models.WinnerRecord{}, err
	}
	defer tx.Rollback()

	person, err := r.pickRandomPerson(ctx, tx)
	if err != nil {
		return models.WinnerRecord{}, err
	}
	prize, err := r.pickRandomPrize(ctx, tx)
	if err != nil {
		return models.WinnerRecord{}, err
	}

	winner, err := r.insertWinner(ctx, tx, person, prize)
	if err != nil {
		return models.WinnerRecord{}, err
	}

	if err := tx.Commit(); err != nil {
		return models.WinnerRecord{}, err
	}
	return winner, nil
}

func (r *SQLServerRepository) availablePeople(ctx context.Context) ([]models.Person, error) {
	query := `SELECT p.id, p.nombre, p.email
FROM personas p
WHERE NOT EXISTS (SELECT 1 FROM ganadores g WHERE g.persona_id = p.id)
ORDER BY p.id`
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var people []models.Person
	for rows.Next() {
		var p models.Person
		if err := rows.Scan(&p.ID, &p.Name, &p.Email); err != nil {
			return nil, err
		}
		people = append(people, p)
	}
	return people, rows.Err()
}

func (r *SQLServerRepository) availablePrizes(ctx context.Context) ([]models.Prize, error) {
	query := `SELECT pr.id, pr.nombre, pr.descripcion
FROM premios pr
WHERE NOT EXISTS (SELECT 1 FROM ganadores g WHERE g.premio_id = pr.id)
ORDER BY pr.id`
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var prizes []models.Prize
	for rows.Next() {
		var p models.Prize
		if err := rows.Scan(&p.ID, &p.Name, &p.Description); err != nil {
			return nil, err
		}
		prizes = append(prizes, p)
	}
	return prizes, rows.Err()
}

func (r *SQLServerRepository) recentWinners(ctx context.Context, limit int) ([]models.WinnerRecord, error) {
	query := `SELECT TOP(@p1) w.id, w.entregado_en, p.id, p.nombre, p.email, r.id, r.nombre, r.descripcion
FROM ganadores w
INNER JOIN personas p ON p.id = w.persona_id
INNER JOIN premios r ON r.id = w.premio_id
ORDER BY w.entregado_en DESC`
	rows, err := r.db.QueryContext(ctx, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var winners []models.WinnerRecord
	for rows.Next() {
		var rec models.WinnerRecord
		if err := rows.Scan(&rec.ID, &rec.AwardedAt, &rec.Person.ID, &rec.Person.Name, &rec.Person.Email, &rec.Prize.ID, &rec.Prize.Name, &rec.Prize.Description); err != nil {
			return nil, err
		}
		winners = append(winners, rec)
	}
	return winners, rows.Err()
}

func (r *SQLServerRepository) pickRandomPerson(ctx context.Context, tx *sql.Tx) (models.Person, error) {
	row := tx.QueryRowContext(ctx, `SELECT TOP 1 p.id, p.nombre, p.email
FROM personas p
WHERE NOT EXISTS (SELECT 1 FROM ganadores g WHERE g.persona_id = p.id)
ORDER BY NEWID()`)
	var p models.Person
	if err := row.Scan(&p.ID, &p.Name, &p.Email); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return models.Person{}, ErrNoParticipants
		}
		return models.Person{}, err
	}
	return p, nil
}

func (r *SQLServerRepository) pickRandomPrize(ctx context.Context, tx *sql.Tx) (models.Prize, error) {
	row := tx.QueryRowContext(ctx, `SELECT TOP 1 pr.id, pr.nombre, pr.descripcion
FROM premios pr
WHERE NOT EXISTS (SELECT 1 FROM ganadores g WHERE g.premio_id = pr.id)
ORDER BY NEWID()`)
	var p models.Prize
	if err := row.Scan(&p.ID, &p.Name, &p.Description); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return models.Prize{}, ErrNoPrizes
		}
		return models.Prize{}, err
	}
	return p, nil
}

func (r *SQLServerRepository) insertWinner(ctx context.Context, tx *sql.Tx, person models.Person, prize models.Prize) (models.WinnerRecord, error) {
	awardedAt := time.Now().UTC()
	result, err := tx.ExecContext(ctx, `INSERT INTO ganadores (persona_id, premio_id, entregado_en) VALUES (@p1, @p2, @p3)`, person.ID, prize.ID, awardedAt)
	if err != nil {
		return models.WinnerRecord{}, err
	}
	winnerID, err := result.LastInsertId()
	if err != nil {
		// SQL Server no soporta LastInsertId, así que obtenemos el id con SCOPE_IDENTITY()
		row := tx.QueryRowContext(ctx, `SELECT CAST(SCOPE_IDENTITY() AS bigint)`)
		if err := row.Scan(&winnerID); err != nil {
			return models.WinnerRecord{}, fmt.Errorf("no se pudo obtener el id del ganador: %w", err)
		}
	}

	return models.WinnerRecord{
		ID:        int(winnerID),
		Person:    person,
		Prize:     prize,
		AwardedAt: awardedAt,
	}, nil
}
