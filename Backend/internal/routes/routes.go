package routes

import (
	"github.com/gin-gonic/gin"
	"apiSorteos/internal/handlers"
)

type RouterConfig struct {
	WorklistHandler *handlers.WorkListHandler
	CeridConsHandler *handlers.CeridConsHandler
}


func SetupRoutes(handlers *RouterConfig) *gin.Engine {
	r := gin.Default()

	// Grupo de rutas WorkList
	worklist := r.Group("/worklist")
	{
		worklist.GET("/:id", handlers.WorklistHandler.GetById)
		worklist.GET("/informe/rayosX/:id", handlers.WorklistHandler.GetInformeById)
		worklist.GET("/informe/ecografia/:id", handlers.WorklistHandler.GetInformeEcoById)
		worklist.GET("/datos/paciente/:id", handlers.WorklistHandler.GetPacienteById)
	}
	/*ceridReceived := r.Group("/api/fundasenCerid/v1")
	{
		ceridReceived.POST("/historial", middleware.BearerAuth(), handlers.CeridConsHandler.Receive)
	}

	ipseReceived := r.Group("/api/fundasenIpse/v1/datos/paciente")
	{
		ipseReceived.POST("/actualizar", middleware.BearerAuth(), handlers.CeridConsHandler.Receive)
	}*/

	closeworklist := r.Group("/cambiarEstadoWorklist") 
	{
		closeworklist.GET("/:id/:estado", handlers.WorklistHandler.ChangeStateById)
	}
	
	changeDateWorklist := r.Group("/cambiarFechaWorklist")
	{
		changeDateWorklist.GET("/:id/:fecha", handlers.WorklistHandler.ChangeDateWorklist)
		
	}

	ceridCons := r.Group("/ceridCons")
	{
		ceridCons.GET("/:id", handlers.CeridConsHandler.GetById)
	}

	return r
}