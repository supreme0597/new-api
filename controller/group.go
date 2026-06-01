package controller

import (
	"net/http"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/gin-gonic/gin"
)

func GetGroups(c *gin.Context) {
	groupNames := make([]string, 0)
	for groupName := range ratio_setting.GetGroupRatioCopy() {
		groupNames = append(groupNames, groupName)
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    groupNames,
	})
}

func GetUserGroups(c *gin.Context) {
	usableGroups := make(map[string]map[string]interface{})
	userGroup := ""
	userId := c.GetInt("id")
	userGroup, _ = model.GetUserGroup(userId, false)
	userUsableGroups := service.GetUserUsableGroups(userGroup)
	// 如果有活跃订阅的升级分组，将其加入可用分组，使下拉框可选
	var upgradeGroup string
	if userId > 0 {
		upgradeGroup = model.GetUserActiveSubscriptionUpgradeGroup(userId)
	}
	if upgradeGroup != "" {
		if _, ok := userUsableGroups[upgradeGroup]; !ok {
			userUsableGroups[upgradeGroup] = setting.GetUsableGroupDescription(upgradeGroup)
		}
	}
	for groupName, _ := range ratio_setting.GetGroupRatioCopy() {
		// UserUsableGroups contains the groups that the user can use
		if desc, ok := userUsableGroups[groupName]; ok {
			usableGroups[groupName] = map[string]interface{}{
				"ratio": service.GetUserGroupRatio(userGroup, groupName),
				"desc":  desc,
			}
		}
	}
	// 如果升级分组在 GetGroupRatioCopy 中没有配置比率，兜底加入
	if upgradeGroup != "" {
		if _, ok := usableGroups[upgradeGroup]; !ok {
			usableGroups[upgradeGroup] = map[string]interface{}{
				"ratio": service.GetUserGroupRatio(userGroup, upgradeGroup),
				"desc":  setting.GetUsableGroupDescription(upgradeGroup),
			}
		}
	}
	if _, ok := userUsableGroups["auto"]; ok {
		usableGroups["auto"] = map[string]interface{}{
			"ratio": "自动",
			"desc":  setting.GetUsableGroupDescription("auto"),
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    usableGroups,
	})
}
