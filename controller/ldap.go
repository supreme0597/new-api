package controller

import (
	"net/http"

	"github.com/QuantumNous/new-api/ldap"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
)

// TestLDAPConnection 测试 LDAP 连接
func TestLDAPConnection(c *gin.Context) {
	settings := system_setting.GetLDAPSettings()
	if !settings.Enabled {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "LDAP 未启用",
		})
		return
	}

	// 检查必要配置
	if settings.Url == "" {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "LDAP 服务器地址未配置",
		})
		return
	}
	if settings.Sc == "" {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "Base DN 未配置",
		})
		return
	}
	if settings.User == "" {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "管理员 DN 未配置",
		})
		return
	}

	// 测试连接
	success, err := ldap.TestConnection()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "LDAP 连接测试失败：" + err.Error(),
		})
		return
	}

	if !success {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "LDAP 连接测试失败",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "LDAP 连接测试成功",
	})
}

// LookupLDAPUser 根据工号查询 LDAP 用户信息
func LookupLDAPUser(c *gin.Context) {
	settings := system_setting.GetLDAPSettings()
	if !settings.Enabled {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "LDAP 未启用",
		})
		return
	}

	employeeID := c.Param("employee_id")
	if employeeID == "" {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "工号不能为空",
		})
		return
	}

	// 使用管理员权限查询用户信息（不需要密码）
	info, err := ldap.LookupUser(employeeID)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "查询用户信息失败：" + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    info,
	})
}
