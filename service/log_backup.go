package service

import (
	"fmt"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
)

var logBackupRunning atomic.Bool

// RunLogBackup 运行日志备份任务
// 将 logs 表中超过保留期的数据迁移到 logs_backup 和 log_details_backup 表
func RunLogBackup() (int, error) {
	if !logBackupRunning.CompareAndSwap(false, true) {
		return 0, nil // 已有任务在执行，跳过
	}
	defer logBackupRunning.Store(false)

	setting := operation_setting.GetLogBackupSetting()
	if !setting.Enabled {
		return 0, nil
	}

	logger.LogInfo(nil, "starting log backup task")

	// 计算保留期限的时间戳（秒级）
	retentionSeconds := int64(setting.RetentionMonths) * 30 * 24 * 3600
	cutoffTimestamp := time.Now().Unix() - retentionSeconds

	batchSize := setting.BatchSize
	if batchSize <= 0 {
		batchSize = 5000
	}

	totalBackedUp := 0
	for {
		// 分批读取需要备份的日志
		var logs []model.Log
		err := model.LOG_DB.
			Where("created_at < ?", cutoffTimestamp).
			Order("id asc").
			Limit(batchSize).
			Find(&logs).Error
		if err != nil {
			logger.LogError(nil, "failed to query logs for backup: "+err.Error())
			return totalBackedUp, err
		}

		if len(logs) == 0 {
			break
		}

		// 收集 log_ids
		logIds := make([]int64, len(logs))
		for i, log := range logs {
			logIds[i] = int64(log.Id)
		}

		// 批量读取 log_details
		var details []model.LogDetail
		if err := model.LOG_DB.Where("log_id IN ?", logIds).Find(&details).Error; err != nil {
			logger.LogError(nil, "failed to query log_details for backup: "+err.Error())
			return totalBackedUp, err
		}
		detailMap := make(map[int64]*model.LogDetail, len(details))
		for i := range details {
			detailMap[details[i].LogId] = &details[i]
		}

		// 开始事务
		tx := model.LOG_DB.Begin()

		// 备份 logs
		backupLogs := make([]model.LogBackup, len(logs))
		now := time.Now().Unix()
		for i, log := range logs {
			backupLogs[i] = model.LogBackup{
				Id:                log.Id,
				UserId:            log.UserId,
				CreatedAt:         log.CreatedAt,
				Type:              log.Type,
				Content:           log.Content,
				Username:          log.Username,
				TokenName:         log.TokenName,
				ModelName:         log.ModelName,
				Quota:             log.Quota,
				PromptTokens:      log.PromptTokens,
				CompletionTokens:  log.CompletionTokens,
				UseTime:           log.UseTime,
				RequestTime:       log.RequestTime,
				ModelStartTime:    log.ModelStartTime,
				ModelEndTime:      log.ModelEndTime,
				IsStream:          log.IsStream,
				ChannelId:         log.ChannelId,
				TokenId:           log.TokenId,
				Group:             log.Group,
				Ip:                log.Ip,
				RequestId:         log.RequestId,
				UpstreamRequestId: log.UpstreamRequestId,
				SessionId:         log.SessionId,
				Other:             log.Other,
				BackedUpAt:        now,
			}
		}
		if err := tx.Create(&backupLogs).Error; err != nil {
			tx.Rollback()
			logger.LogError(nil, "failed to create log backups: "+err.Error())
			return totalBackedUp, err
		}

		// 备份 log_details
		var backupDetails []model.LogDetailBackup
		for logId, detail := range detailMap {
			backupDetails = append(backupDetails, model.LogDetailBackup{
				LogId:        logId,
				RequestData:  detail.RequestData,
				RequestBody:  detail.RequestBody,
				ResponseBody: detail.ResponseBody,
				BackedUpAt:   now,
			})
		}
		if len(backupDetails) > 0 {
			if err := tx.Create(&backupDetails).Error; err != nil {
				tx.Rollback()
				logger.LogError(nil, "failed to create log_detail backups: "+err.Error())
				return totalBackedUp, err
			}
		}

		// 删除原始数据
		if err := tx.Where("log_id IN ?", logIds).Delete(&model.LogDetail{}).Error; err != nil {
			tx.Rollback()
			logger.LogError(nil, "failed to delete log_details: "+err.Error())
			return totalBackedUp, err
		}
		if err := tx.Where("id IN ?", logIds).Delete(&model.Log{}).Error; err != nil {
			tx.Rollback()
			logger.LogError(nil, "failed to delete logs: "+err.Error())
			return totalBackedUp, err
		}

		if err := tx.Commit().Error; err != nil {
			logger.LogError(nil, "failed to commit backup transaction: "+err.Error())
			return totalBackedUp, err
		}

		totalBackedUp += len(logs)
		logger.LogInfo(nil, fmt.Sprintf("log backup progress: backed up %d logs", len(logs)))
	}

	logger.LogInfo(nil, fmt.Sprintf("log backup task completed, total backed up: %d", totalBackedUp))
	return totalBackedUp, nil
}
