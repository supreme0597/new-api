package middleware

import (
	"context"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
)

func SessionId() func(c *gin.Context) {
	return func(c *gin.Context) {
		// 1. Try explicit session id header
		if sid := strings.TrimSpace(c.GetHeader(common.SessionIdKey)); sid != "" {
			setSessionId(c, sid)
			c.Next()
			return
		}
		// 2. Try candidate headers (OpenCode, generic)
		for _, h := range common.SessionHeaderCandidates {
			if sid := strings.TrimSpace(c.GetHeader(h)); sid != "" {
				setSessionId(c, sid)
				c.Next()
				return
			}
		}
		// 3. Body fallback will be handled in controller/relay.go after reading the body
		c.Next()
	}
}

func setSessionId(c *gin.Context, sid string) {
	if len(sid) > 128 {
		sid = sid[:128]
	}
	c.Set(common.SessionIdKey, sid)
	ctx := context.WithValue(c.Request.Context(), common.SessionIdKey, sid)
	c.Request = c.Request.WithContext(ctx)
}
