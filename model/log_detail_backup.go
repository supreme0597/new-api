package model

// LogDetailBackup 日志详情备份表，存储 log_details 表归档的数据
type LogDetailBackup struct {
	LogId        int64  `json:"log_id" gorm:"primaryKey"`
	RequestData  string `json:"request_data" gorm:"type:longtext"`  // 完整请求记录 JSON
	RequestBody  string `json:"request_body" gorm:"type:longtext"`  // 请求体原文
	ResponseBody string `json:"response_body" gorm:"type:longtext"` // 响应体原文
	BackedUpAt   int64  `json:"backed_up_at" gorm:"bigint;index"`
}
