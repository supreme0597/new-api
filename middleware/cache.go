package middleware

import (
	"github.com/gin-gonic/gin"
)

func Cache() func(c *gin.Context) {
	return func(c *gin.Context) {
		// Use no-cache for all resources so the browser always revalidates with
		// the server. This is required because the theme can switch at runtime
		// (between "default" and "classic" frontends), which changes the
		// underlying embedded file-system. A long max-age would cause the
		// browser to serve stale assets from the old theme even after switching.
		c.Header("Cache-Control", "no-cache")
		c.Header("Cache-Version", "b688f2fb5be447c25e5aa3bd063087a83db32a288bf6a4f35f2d8db310e40b14")
		c.Next()
	}
}
