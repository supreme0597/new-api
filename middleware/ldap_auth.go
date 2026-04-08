package middleware

import (
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
)

// LDAPTokenAuth LDAP 工号令牌认证中间件
// 从 Authorization header 获取工号 (格式：Bearer <employee_id>)
// 或从 LDAP-Token header 直接获取工号
// 逻辑：令牌优先 -> 令牌存在直接用 -> 令牌不存在则LDAP查用户是否存在
func LDAPTokenAuth() func(c *gin.Context) {
	return func(c *gin.Context) {
		// 1. 获取工号
		authHeader := c.Request.Header.Get("Authorization")
		ldapTokenHeader := c.Request.Header.Get("LDAP-Token")

		var employeeID string

		// 优先从 LDAP-Token header 获取
		if ldapTokenHeader != "" {
			employeeID = strings.TrimSpace(ldapTokenHeader)
		} else if authHeader != "" {
			// 从 Authorization header 获取 (支持 Bearer 格式)
			if strings.HasPrefix(authHeader, "Bearer ") || strings.HasPrefix(authHeader, "bearer ") {
				employeeID = strings.TrimSpace(authHeader[7:])
			} else {
				employeeID = strings.TrimSpace(authHeader)
			}
		}

		if employeeID == "" {
			c.JSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"message": "未提供 Authorization 或 LDAP-Token header",
			})
			c.Abort()
			return
		}

		// 2. 调用 LDAP 服务认证并创建令牌（内部会自动处理令牌优先逻辑）
		ldapService := service.NewLdapTokenService()
		user, token, err := ldapService.AuthenticateByEmployeeID(employeeID)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"message": err.Error(),
			})
			c.Abort()
			return
		}

		// 3. 检查用户状态
		if user.Status != common.UserStatusEnabled {
			c.JSON(http.StatusForbidden, gin.H{
				"success": false,
				"message": "用户已被封禁",
			})
			c.Abort()
			return
		}

		// 4. 设置上下文 (与 TokenAuth 兼容)
		c.Set("id", user.Id)
		c.Set("user_id", user.Id)
		c.Set("username", user.Username)
		c.Set("token_id", token.Id)
		c.Set("token_key", token.Key)
		c.Set("token_name", token.Name)
		c.Set("token_unlimited_quota", token.UnlimitedQuota)

		if !token.UnlimitedQuota {
			c.Set("token_quota", token.RemainQuota)
		}

		// 设置 token_model_limit
		if token.ModelLimitsEnabled {
			c.Set("token_model_limit_enabled", true)
			c.Set("token_model_limit", token.GetModelLimitsMap())
		} else {
			c.Set("token_model_limit_enabled", false)
		}

		// 设置分组
		userGroup := user.Group
		tokenGroup := token.Group
		if tokenGroup != "" {
			c.Set("user_group", tokenGroup)
		} else {
			c.Set("user_group", userGroup)
		}

		// 5. 更新令牌最后访问时间
		token.AccessedTime = common.GetTimestamp()
		// 注意：这里不保存，因为每次请求都会更新，可以异步批量保存

		c.Next()
	}
}

// LDAPTokenOrUserAuth 支持 LDAP 令牌或会话认证
func LDAPTokenOrUserAuth() func(c *gin.Context) {
	return func(c *gin.Context) {
		// 先尝试 LDAP 令牌认证
		if c.Request.Header.Get("Authorization") != "" || c.Request.Header.Get("LDAP-Token") != "" {
			LDAPTokenAuth()(c)
			if c.Writer.Status() == http.StatusOK {
				return
			}
		}

		// 回退到会话认证
		session := sessions.Default(c)
		if id := session.Get("id"); id != nil {
			if status, ok := session.Get("status").(int); ok && status == common.UserStatusEnabled {
				c.Set("id", id)
				c.Next()
				return
			}
		}

		c.JSON(http.StatusUnauthorized, gin.H{
			"success": false,
			"message": "未登录且未提供有效的 LDAP 令牌",
		})
		c.Abort()
	}
}
