package model

import (
	"fmt"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

// QuotaData 柱状图数据
type QuotaData struct {
	Id        int    `json:"id"`
	UserID    int    `json:"user_id" gorm:"index"`
	Username  string `json:"username" gorm:"index:idx_qdt_model_user_name,priority:2;size:64;default:''"`
	ModelName string `json:"model_name" gorm:"index:idx_qdt_model_user_name,priority:1;size:64;default:''"`
	CreatedAt int64  `json:"created_at" gorm:"bigint;index:idx_qdt_created_at,priority:2"`
	TokenUsed int    `json:"token_used" gorm:"default:0"`
	Count     int    `json:"count" gorm:"default:0"`
	Quota     int    `json:"quota" gorm:"default:0"`
}

func UpdateQuotaData() {
	for {
		if common.DataExportEnabled {
			common.SysLog("正在更新数据看板数据...")
			SaveQuotaDataCache()
		}
		time.Sleep(time.Duration(common.DataExportInterval) * time.Minute)
	}
}

var CacheQuotaData = make(map[string]*QuotaData)
var CacheQuotaDataLock = sync.Mutex{}

func logQuotaDataCache(userId int, username string, modelName string, quota int, createdAt int64, tokenUsed int) {
	key := fmt.Sprintf("%d-%s-%s-%d", userId, username, modelName, createdAt)
	quotaData, ok := CacheQuotaData[key]
	if ok {
		quotaData.Count += 1
		quotaData.Quota += quota
		quotaData.TokenUsed += tokenUsed
	} else {
		quotaData = &QuotaData{
			UserID:    userId,
			Username:  username,
			ModelName: modelName,
			CreatedAt: createdAt,
			Count:     1,
			Quota:     quota,
			TokenUsed: tokenUsed,
		}
	}
	CacheQuotaData[key] = quotaData
}

func LogQuotaData(userId int, username string, modelName string, quota int, createdAt int64, tokenUsed int) {
	// 只精确到小时
	createdAt = createdAt - (createdAt % 3600)

	CacheQuotaDataLock.Lock()
	defer CacheQuotaDataLock.Unlock()
	logQuotaDataCache(userId, username, modelName, quota, createdAt, tokenUsed)
}

func SaveQuotaDataCache() {
	CacheQuotaDataLock.Lock()
	defer CacheQuotaDataLock.Unlock()
	size := len(CacheQuotaData)
	// 如果缓存中有数据，就保存到数据库中
	// 1. 先查询数据库中是否有数据
	// 2. 如果有数据，就更新数据
	// 3. 如果没有数据，就插入数据
	for _, quotaData := range CacheQuotaData {
		quotaDataDB := &QuotaData{}
		DB.Table("quota_data").Where("user_id = ? and username = ? and model_name = ? and created_at = ?",
			quotaData.UserID, quotaData.Username, quotaData.ModelName, quotaData.CreatedAt).First(quotaDataDB)
		if quotaDataDB.Id > 0 {
			//quotaDataDB.Count += quotaData.Count
			//quotaDataDB.Quota += quotaData.Quota
			//DB.Table("quota_data").Save(quotaDataDB)
			increaseQuotaData(quotaData.UserID, quotaData.Username, quotaData.ModelName, quotaData.Count, quotaData.Quota, quotaData.CreatedAt, quotaData.TokenUsed)
		} else {
			DB.Table("quota_data").Create(quotaData)
		}
	}
	CacheQuotaData = make(map[string]*QuotaData)
	common.SysLog(fmt.Sprintf("保存数据看板数据成功，共保存%d条数据", size))
}

func increaseQuotaData(userId int, username string, modelName string, count int, quota int, createdAt int64, tokenUsed int) {
	err := DB.Table("quota_data").Where("user_id = ? and username = ? and model_name = ? and created_at = ?",
		userId, username, modelName, createdAt).Updates(map[string]interface{}{
		"count":      gorm.Expr("count + ?", count),
		"quota":      gorm.Expr("quota + ?", quota),
		"token_used": gorm.Expr("token_used + ?", tokenUsed),
	}).Error
	if err != nil {
		common.SysLog(fmt.Sprintf("increaseQuotaData error: %s", err))
	}
}

func GetQuotaDataByUsername(username string, startTime int64, endTime int64) (quotaData []*QuotaData, err error) {
	var quotaDatas []*QuotaData
	// 从quota_data表中查询数据
	err = DB.Table("quota_data").Where("username = ? and created_at >= ? and created_at <= ?", username, startTime, endTime).Find(&quotaDatas).Error
	return quotaDatas, err
}

func GetQuotaDataByUserId(userId int, startTime int64, endTime int64) (quotaData []*QuotaData, err error) {
	var quotaDatas []*QuotaData
	// 从quota_data表中查询数据
	err = DB.Table("quota_data").Where("user_id = ? and created_at >= ? and created_at <= ?", userId, startTime, endTime).Find(&quotaDatas).Error
	return quotaDatas, err
}

// GetQuotaDataGroupByUser 按用户分组查询配额数据，支持按厂商和用户分组过滤
// includeAll: 为 true 时，LEFT JOIN users 表，包含未使用过的用户（额度为 0）
func GetQuotaDataGroupByUser(startTime int64, endTime int64, vendor string, group string, includeAll bool) (quotaData []*QuotaData, err error) {
	var quotaDatas []*QuotaData

	if includeAll {
		// 构建 quota_data 子查询（聚合时间序列）
		subQuery := DB.Table("quota_data").
			Select("username, created_at, sum(count) as count, sum(quota) as quota, sum(token_used) as token_used").
			Where("quota_data.created_at >= ? and quota_data.created_at <= ?", startTime, endTime)

		if vendor != "" {
			vendorSubQuery := DB.Table("models").
				Select("models.model_name").
				Joins("JOIN vendors ON models.vendor_id = vendors.id").
				Where("vendors.name = ?", vendor)
			subQuery = subQuery.Where("quota_data.model_name IN (?)", vendorSubQuery)
		}

		subQuery = subQuery.Group("quota_data.username, quota_data.created_at")

		// LEFT JOIN users 表，使未使用过的用户也出现在结果中
		query := DB.Table("users").
			Select("COALESCE(qd.username, users.username) as username, COALESCE(qd.created_at, ?) as created_at, COALESCE(qd.count, 0) as count, COALESCE(qd.quota, 0) as quota, COALESCE(qd.token_used, 0) as token_used", endTime).
			Joins("LEFT JOIN (?) qd ON users.username = qd.username", subQuery).
			Where("users.deleted_at IS NULL")

		if group != "" {
			query = query.Where("users."+commonGroupCol+" = ?", group)
		}

		err = query.Find(&quotaDatas).Error
		return quotaDatas, err
	}

	// 构建基础查询（原逻辑）
	query := DB.Table("quota_data").
		Select("quota_data.username, quota_data.created_at, sum(quota_data.count) as count, sum(quota_data.quota) as quota, sum(quota_data.token_used) as token_used").
		Where("quota_data.created_at >= ? and quota_data.created_at <= ?", startTime, endTime)

	// 如果指定了厂商，使用子查询过滤 model_name
	if vendor != "" {
		// 子查询：获取该厂商对应的所有 model_name
		subQuery := DB.Table("models").
			Select("models.model_name").
			Joins("JOIN vendors ON models.vendor_id = vendors.id").
			Where("vendors.name = ?", vendor)

		query = query.Where("quota_data.model_name IN (?)", subQuery)
	}

	// 如果指定了用户分组，JOIN users 表按 group 过滤
	if group != "" {
		query = query.Joins("JOIN users ON quota_data.user_id = users.id").
			Where("users."+commonGroupCol+" = ?", group)
	}

	err = query.Group("quota_data.username, quota_data.created_at").Find(&quotaDatas).Error
	return quotaDatas, err
}

// GetVendorModelNames 获取指定厂商的所有模型名称（用于前端过滤）
func GetVendorModelNames(vendor string) ([]string, error) {
	var modelNames []string
	err := DB.Table("models").
		Select("models.model_name").
		Joins("JOIN vendors ON models.vendor_id = vendors.id").
		Where("vendors.name = ?", vendor).
		Pluck("models.model_name", &modelNames).Error
	return modelNames, err
}

func GetAllQuotaDates(startTime int64, endTime int64, username string) (quotaData []*QuotaData, err error) {
	if username != "" {
		return GetQuotaDataByUsername(username, startTime, endTime)
	}
	var quotaDatas []*QuotaData
	// 从quota_data表中查询数据
	// only select model_name, sum(count) as count, sum(quota) as quota, model_name, created_at from quota_data group by model_name, created_at;
	//err = DB.Table("quota_data").Where("created_at >= ? and created_at <= ?", startTime, endTime).Find(&quotaDatas).Error
	err = DB.Table("quota_data").Select("model_name, sum(count) as count, sum(quota) as quota, sum(token_used) as token_used, created_at").Where("created_at >= ? and created_at <= ?", startTime, endTime).Group("model_name, created_at").Find(&quotaDatas).Error
	return quotaDatas, err
}
