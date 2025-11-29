package main

import (
	"log"
	"net/http"
	"os"

	"apiSorteos/internal/handlers"
	"apiSorteos/internal/raffle"
	"apiSorteos/internal/repository"

	"github.com/gin-gonic/gin"
)

func main() {
	adminPassword := os.Getenv("ADMIN_PASSWORD")
	if adminPassword == "" {
		adminPassword = "navidad2024"
	}

	repo := repository.NewInMemoryRepository()
	service := raffle.NewService(repo)
	auth := raffle.NewAuthService(adminPassword)

	router := gin.Default()
	router.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Origin, Content-Type, Authorization")
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	})

	apiHandler := handlers.NewAPIHandler(service, auth)

	api := router.Group("/api")
	{
		api.POST("/auth/login", apiHandler.Login)
		api.GET("/state", apiHandler.GetState)
		api.POST("/draw", apiHandler.AdminOnly(apiHandler.RunDraw))
	}

	router.GET("/events", apiHandler.StreamEvents)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	srv := &http.Server{
		Addr:    ":" + port,
		Handler: router,
	}

	log.Printf("Servidor escuchando en el puerto %s", port)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("No se pudo iniciar el servidor: %v", err)
	}
}
