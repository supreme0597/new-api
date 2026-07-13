package operation_setting

import "github.com/QuantumNous/new-api/setting/config"

// LogBackupSetting 日志备份设置
type LogBackupSetting struct {
	Enabled         bool `json:"enabled"`           // 默认 false，启用定时备份
	RetentionMonths int  `json:"retention_months"`  // 保留月数，默认 3
	BatchSize       int  `json:"batch_size"`        // 每批处理数量，默认 5000
}

var logBackupSetting = LogBackupSetting{
	Enabled:         false,
	RetentionMonths: 3,
	BatchSize:       5000,
}

func init() {
	config.GlobalConfig.Register("log_backup_setting", &logBackupSetting)
}

func GetLogBackupSetting() *LogBackupSetting {
	return &logBackupSetting
}
