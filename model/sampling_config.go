package model

import (
	"github.com/QuantumNous/new-api/common"
)

// SamplingConfig 采样配置
type SamplingConfig struct {
	Id        int    `json:"id"`
	Name      string `json:"name" gorm:"type:varchar(64)"`
	Prompt    string `json:"prompt" gorm:"type:text"`
	MaxTokens int    `json:"max_tokens" gorm:"default:2048"`
	IsActive  int    `json:"is_active" gorm:"default:1"`
	CreatedBy int    `json:"created_by"`
	UpdatedAt int64  `json:"updated_at" gorm:"bigint"`
}

func (SamplingConfig) TableName() string {
	return "sampling_configs"
}

// GetSamplingConfigs 获取所有采样配置
func GetSamplingConfigs() ([]*SamplingConfig, error) {
	var configs []*SamplingConfig
	err := DB.Order("id ASC").Find(&configs).Error
	return configs, err
}

// GetActiveSamplingConfigs 获取所有启用的采样配置
func GetActiveSamplingConfigs() ([]*SamplingConfig, error) {
	var configs []*SamplingConfig
	err := DB.Where("is_active = ?", 1).Order("id ASC").Find(&configs).Error
	return configs, err
}

// GetSamplingConfigById 根据ID获取采样配置
func GetSamplingConfigById(id int) (*SamplingConfig, error) {
	var config SamplingConfig
	err := DB.First(&config, "id = ?", id).Error
	return &config, err
}

// CreateSamplingConfig 创建采样配置
func CreateSamplingConfig(config *SamplingConfig) error {
	config.UpdatedAt = common.GetTimestamp()
	return DB.Create(config).Error
}

// UpdateSamplingConfig 更新采样配置
func UpdateSamplingConfig(config *SamplingConfig) error {
	config.UpdatedAt = common.GetTimestamp()
	return DB.Save(config).Error
}

// DeleteSamplingConfig 删除采样配置
func DeleteSamplingConfig(id int) error {
	return DB.Delete(&SamplingConfig{}, "id = ?", id).Error
}

// ToggleSamplingConfig 切换采样配置的启用/禁用状态
func ToggleSamplingConfig(id int) error {
	var config SamplingConfig
	if err := DB.First(&config, "id = ?", id).Error; err != nil {
		return err
	}
	newStatus := 1
	if config.IsActive == 1 {
		newStatus = 0
	}
	return DB.Model(&config).Update("is_active", newStatus).Error
}

// GetSamplingInterval 获取采样间隔（分钟）
// 从 Option 表中读取，默认30分钟
func GetSamplingInterval() int {
	return common.GetEnvOrDefault("SAMPLING_INTERVAL", 30)
}
