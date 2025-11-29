package middleware

import (
	"apiSorteos/internal/config"
	"net/http"
	"strings"
	"fmt"
	"github.com/gin-gonic/gin"
)

func BearerAuth() gin.HandlerFunc {
	clave:=config.Configs().Jwt.Secret
	fmt.Printf("Este es el token %v", clave)
	return func(c *gin.Context){
		auth := c.GetHeader("Authorization")

		if auth == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Missing Authorization header"})
			c.Abort()
			return 
		}

		parts := strings.Split(auth, " ")
		if len (parts) != 2 || strings.ToLower(parts[0])!= "bearer"{
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid Authorization Format"})
			c.Abort()
			return
		}

		token := parts[1]
		if token != clave {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalida token"})
			c.Abort()
			return 
		}
		c.Next()
	}
}