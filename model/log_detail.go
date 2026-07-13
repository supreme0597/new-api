package model

// LogDetail 日志详情，存储大字段（request_data, request_body, response_body）
// 与 logs 表通过 log_id (logs.id) 关联
type LogDetail struct {
	LogId        int64  `json:"log_id" gorm:"primaryKey"`
	RequestData  string `json:"request_data" gorm:"type:longtext"`  // 完整请求记录 JSON
	RequestBody  string `json:"request_body" gorm:"type:longtext"`  // 请求体原文
	ResponseBody string `json:"response_body" gorm:"type:longtext"` // 响应体原文
}

// GetLogDetailByLogId 根据 log_id 查询日志详情
func GetLogDetailByLogId(logId int64) (*LogDetail, error) {
	var detail LogDetail
	err := LOG_DB.Where("log_id = ?", logId).First(&detail).Error
	if err != nil {
		return nil, err
	}
	return &detail, nil
}

// CreateLogDetail 创建日志详情记录
func CreateLogDetail(detail *LogDetail) error {
	return LOG_DB.Create(detail).Error
}
