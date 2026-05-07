package router

import (
	"fmt"
	"net/http"
	"os"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"

	"github.com/gin-gonic/gin"
)

func SetRouter(engine *gin.Engine, buildFS embed.FS, indexPage []byte) {
	// If CONTEXT_PATH is set, create a top-level router group so all routes are prefixed
	var baseRouter gin.IRouter = engine
	if common.ContextPath != "" {
		baseRouter = engine.Group(common.ContextPath)
	}

	SetApiRouter(baseRouter)
	SetDashboardRouter(baseRouter)
	SetRelayRouter(baseRouter)
	SetVideoRouter(baseRouter)
	frontendBaseUrl := os.Getenv("FRONTEND_BASE_URL")
	if common.IsMasterNode && frontendBaseUrl != "" {
		frontendBaseUrl = ""
		common.SysLog("FRONTEND_BASE_URL is ignored on master node")
	}
	if frontendBaseUrl == "" {
		SetWebRouter(engine, baseRouter, buildFS, indexPage)
	} else {
		frontendBaseUrl = strings.TrimSuffix(frontendBaseUrl, "/")
		engine.NoRoute(func(c *gin.Context) {
			c.Set(middleware.RouteTagKey, "web")
			c.Redirect(http.StatusMovedPermanently, fmt.Sprintf("%s%s", frontendBaseUrl, c.Request.RequestURI))
		})
	}
}
