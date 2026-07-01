package controller

import (
	"net/http"
	"strconv"

	perfmetrics "github.com/QuantumNous/new-api/pkg/perf_metrics"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/gin-gonic/gin"
	"github.com/samber/lo"
)

func GetPerfMetricsSummary(c *gin.Context) {
	hours := 24
	if rawHours := c.Query("hours"); rawHours != "" {
		if parsed, err := strconv.Atoi(rawHours); err == nil {
			hours = parsed
		}
	}
	startTimeMs, _ := strconv.ParseInt(c.Query("start_time"), 10, 64)
	endTimeMs, _ := strconv.ParseInt(c.Query("end_time"), 10, 64)

	activeGroups := append(lo.Keys(ratio_setting.GetGroupRatioCopy()), "auto")
	result, err := perfmetrics.QuerySummaryAll(hours, activeGroups, startTimeMs/1000, endTimeMs/1000)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    result,
	})
}

func GetPerfMetrics(c *gin.Context) {
	modelName := c.Query("model")
	if modelName == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "model is required",
		})
		return
	}

	hours := 24
	if rawHours := c.Query("hours"); rawHours != "" {
		if parsed, err := strconv.Atoi(rawHours); err == nil {
			hours = parsed
		}
	}
	startTimeMs, _ := strconv.ParseInt(c.Query("start_time"), 10, 64)
	endTimeMs, _ := strconv.ParseInt(c.Query("end_time"), 10, 64)

	result, err := perfmetrics.Query(perfmetrics.QueryParams{
		Model:   modelName,
		Group:   c.Query("group"),
		Hours:   hours,
		StartTs: startTimeMs / 1000,
		EndTs:   endTimeMs / 1000,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	filtered := filterActiveGroups(result.Groups)
	if len(filtered) > 0 {
		result.Groups = filtered
	}
	// If no active groups match, keep all groups to avoid empty results
	// (consistent with leaderboard which does not filter by group)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    result,
	})
}

func filterActiveGroups(groups []perfmetrics.GroupResult) []perfmetrics.GroupResult {
	activeRatios := ratio_setting.GetGroupRatioCopy()
	return lo.Filter(groups, func(g perfmetrics.GroupResult, _ int) bool {
		_, ok := activeRatios[g.Group]
		return ok || g.Group == "auto"
	})
}
