package config

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"
)

type Config struct {
	Server struct {
		Port        int    `json:"port"`
		Environment string `json:"environment"`
	} `json:"server"`
	Database struct {
		Host       string `json:"host"`
		Port       int    `json:"port"`
		User       string `json:"user"`
		Password   string `json:"password"`
		Name       string `json:"name"`
		Encrypt    string `json:"encrypt"`
		MultinegDB string `json:"multinegDB"`
	} `json:"database"`
	Jwt struct {
		Secret          string `json:"secret"`
		ExpirationHours int    `json:"expirationHours"`
	} `json:"jwt"`
	Logs struct {
		Path string `json:"path"`
	} `json:"logs"`
}

var configs *Config

func LoadConfig(path string) {
	file, err := os.Open(path)
	if err != nil {
		log.Fatal("No se ha encontrado el archivo de configuraciones JSON")
	}
	defer file.Close()
	configs = &Config{}
	if err := json.NewDecoder(file).Decode(configs); err != nil {
		log.Fatalf("Archivo JSON con errores en estructura: %v", err)
	}

	logDir := filepath.Dir(configs.Logs.Path)
	if _, err := os.Stat(logDir); os.IsNotExist(err) {
		if mkErr := os.MkdirAll(logDir, os.ModePerm); mkErr != nil {
			log.Fatalf("No se puede crear carpetas en la ubicacion %v", mkErr)
		}
	}

	date := time.Now().Format("2006-01-02") // YYYY-MM-DD
	ext := filepath.Ext(configs.Logs.Path)
	base := configs.Logs.Path[:len(configs.Logs.Path)-len(ext)]
	logPath := fmt.Sprintf("%s_%s%s", base, date, ext)

	logFile, err := os.OpenFile(logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		fmt.Println("Error accediendo al log :'(")
	}
	log.SetOutput(logFile)
	//defer logFile.Close()
}

func Configs() *Config {
	return configs
}
