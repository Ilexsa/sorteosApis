package main

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

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

	repo, cleanup, err := buildRepository()
	if err != nil {
		log.Fatalf("No se pudo inicializar el repositorio: %v", err)
	}
	defer cleanup()
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

func buildRepository() (repository.Repository, func(), error) {
	if strings.EqualFold(os.Getenv("USE_INMEMORY"), "true") {
		log.Printf("USE_INMEMORY activo, usando datos de ejemplo en memoria")
		return repository.NewInMemoryRepository(), func() {}, nil
	}

	db, err := connectSQLServer()
	if err != nil {
		return nil, func() {}, err
	}

	log.Printf("Conectado a SQL Server correctamente")
	return repository.NewSQLServerRepository(db), func() {
		if err := db.Close(); err != nil {
			log.Printf("Error al cerrar la conexión a SQL Server: %v", err)
		}
	}, nil
}

func connectSQLServer() (*sql.DB, error) {
	connStr := os.Getenv("SQLSERVER_CONN")
	if connStr == "" {
		host := getenv("SQLSERVER_HOST", "localhost")
		port := getenv("SQLSERVER_PORT", "1433")
		encrypt := getenv("SQLSERVER_ENCRYPT", "disable")
		trust := getenv("SQLSERVER_TRUST_CERT", "true")
		user := getenv("SQLSERVER_USER", "sa")
		pass := getenv("SQLSERVER_PASSWORD", "")
		db := getenv("SQLSERVER_DB", "SORTEOS")
		connStr = fmt.Sprintf("server=%s;port=%s;user id=%s;password=%s;database=%s;encrypt=%s;TrustServerCertificate=%s;connection timeout=5",
			host, port, user, pass, db, encrypt, trust)
	}

	sqlDB, err := sql.Open("sqlserver", connStr)
	if err != nil {
		return nil, fmt.Errorf("no se pudo crear el pool de conexiones: %w", err)
	}
	sqlDB.SetConnMaxIdleTime(5 * time.Minute)
	sqlDB.SetConnMaxLifetime(30 * time.Minute)
	sqlDB.SetMaxOpenConns(10)
	sqlDB.SetMaxIdleConns(5)

	if err := sqlDB.Ping(); err != nil {
		return nil, fmt.Errorf("no se pudo conectar a SQL Server: %w", err)
	}
	return sqlDB, nil
}

func getenv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}
