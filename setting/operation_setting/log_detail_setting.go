package operation_setting

import "github.com/QuantumNous/new-api/setting/config"

// LogDetailSetting 日志详情存储设置
type LogDetailSetting struct {
	Enabled     bool `json:"enabled"`       // 默认 true
	MaxBodySize int  `json:"max_body_size"` // 默认 1048576 (1MB)，超过截断
}

var logDetailSetting = LogDetailSetting{
	Enabled:     true,
	MaxBodySize: 1 * 1024 * 1024, // 1MB
}

func init() {
	config.GlobalConfig.Register("log_detail_setting", &logDetailSetting)
}

func GetLogDetailSetting() *LogDetailSetting {
	return &logDetailSetting
}
