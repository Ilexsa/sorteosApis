package raffle

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"time"
)

type AuthService struct {
	adminPassword string
	token         string
}

func NewAuthService(password string) *AuthService {
	return &AuthService{adminPassword: password}
}

func (a *AuthService) Login(password string) (string, error) {
	if password != a.adminPassword {
		return "", errors.New("contraseña inválida")
	}
	// token estable pero difícil de adivinar
	hash := sha256.Sum256([]byte(fmt.Sprintf("%s-%d", password, time.Now().UnixNano())))
	a.token = hex.EncodeToString(hash[:])
	return a.token, nil
}

func (a *AuthService) Validate(token string) bool {
	return token != "" && token == a.token
}
