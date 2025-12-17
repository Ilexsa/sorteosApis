package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"apiSorteos/internal/raffle"
	"apiSorteos/internal/repository"

	"github.com/gin-gonic/gin"
)

type APIHandler struct {
	service *raffle.Service
	auth    *raffle.AuthService
}

func NewAPIHandler(service *raffle.Service, auth *raffle.AuthService) *APIHandler {
	return &APIHandler{service: service, auth: auth}
}

func (h *APIHandler) Login(c *gin.Context) {
	var payload struct {
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cuerpo inválido"})
		return
	}
	token, err := h.auth.Login(payload.Password)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"token": token})
}

func (h *APIHandler) GetState(c *gin.Context) {
	state, err := h.service.State(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, state)
}

func (h *APIHandler) RunDraw(c *gin.Context) {
	var payload struct {
		PrizeID int `json:"prizeId"`
	}
	_ = c.ShouldBindJSON(&payload)

	record, err := h.service.Draw(c.Request.Context(), payload.PrizeID)
	if err != nil {
		status := http.StatusInternalServerError
		if err == repository.ErrNoParticipants || err == repository.ErrNoPrizes || err == repository.ErrPrizeUnavailable {
			status = http.StatusConflict
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, record)
}

func (h *APIHandler) AdminOnly(next gin.HandlerFunc) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		token := strings.TrimPrefix(authHeader, "Bearer ")
		if !h.auth.Validate(token) {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "No autorizado"})
			return
		}
		next(c)
	}
}

func (h *APIHandler) StreamEvents(c *gin.Context) {
	client := h.service.RegisterClient()
	go func() {
		<-c.Request.Context().Done()
		h.service.UnregisterClient(client)
	}()
	c.Stream(func(w io.Writer) bool {
		if evt, ok := <-client.Chan(); ok {
			c.SSEvent(evt.Type, evt.Data)
			return true
		}
		return false
	})
	h.service.UnregisterClient(client)
}

func writeJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
