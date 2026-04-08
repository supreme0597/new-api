package router

import (
	"embed"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-contrib/gzip"
	"github.com/gin-contrib/static"
	"github.com/gin-gonic/gin"
)

func SetWebRouter(engine *gin.Engine, baseRouter gin.IRouter, buildFS embed.FS, indexPage []byte) {
	baseRouter.Use(gzip.Gzip(gzip.DefaultCompression))
	baseRouter.Use(middleware.GlobalWebRateLimit())
	baseRouter.Use(middleware.Cache())
	baseRouter.Use(static.Serve("/", common.EmbedFolder(buildFS, "web/dist")))

	engine.NoRoute(func(c *gin.Context) {
		c.Set(middleware.RouteTagKey, "web")
		prefix := common.ContextPath
		uri := c.Request.RequestURI
		if strings.HasPrefix(uri, prefix+"/v1") || strings.HasPrefix(uri, prefix+"/api") {
			controller.RelayNotFound(c)
			return
		}
		c.Header("Cache-Control", "no-cache")
		c.Data(http.StatusOK, "text/html; charset=utf-8", indexPage)
	})
}
