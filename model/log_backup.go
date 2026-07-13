package model

// LogBackup 日志备份表，存储 logs 表归档的元数据（不含 body 字段）
// body 数据存储在 log_details 表中，通过 log_id 关联
type LogBackup struct {
	Id                int    `json:"id" gorm:"primaryKey"`
	UserId            int    `json:"user_id" gorm:"index"`
	CreatedAt         int64  `json:"created_at" gorm:"bigint;index"`
	Type              int    `json:"type" gorm:"index"`
	Content           string `json:"content"`
	Username          string `json:"username" gorm:"index"`
	TokenName         string `json:"token_name" gorm:"index"`
	ModelName         string `json:"model_name" gorm:"index"`
	Quota             int    `json:"quota" gorm:"default:0"`
	PromptTokens      int    `json:"prompt_tokens" gorm:"default:0"`
	CompletionTokens  int    `json:"completion_tokens" gorm:"default:0"`
	UseTime           int    `json:"use_time" gorm:"default:0"`
	RequestTime       int64  `json:"request_time" gorm:"bigint;default:0"`
	ModelStartTime    int64  `json:"model_start_time" gorm:"bigint;default:0"`
	ModelEndTime      int64  `json:"model_end_time" gorm:"bigint;default:0"`
	IsStream          bool   `json:"is_stream"`
	ChannelId         int    `json:"channel" gorm:"index"`
	TokenId           int    `json:"token_id" gorm:"default:0;index"`
	Group             string `json:"group" gorm:"index"`
	Ip                string `json:"ip" gorm:"index;default:''"`
	RequestId         string `json:"request_id,omitempty" gorm:"type:varchar(64);index;default:''"`
	UpstreamRequestId string `json:"upstream_request_id,omitempty" gorm:"type:varchar(128);index;default:''"`
	SessionId         string `json:"session_id,omitempty" gorm:"type:varchar(128);index;default:''"`
	Other             string `json:"other"`
	// 备份时间
	BackedUpAt int64 `json:"backed_up_at" gorm:"bigint;index"`
}
