package model

import (
	"strings"
)

// ChannelSourceMapping 渠道来源映射，根据 base_url 自动推断渠道来源
type ChannelSourceMapping struct {
	Id             int    `json:"id"`
	SourceName     string `json:"source_name" gorm:"type:varchar(64);index"`
	BaseURLPattern string `json:"base_url_pattern" gorm:"type:varchar(255)"`
	Priority       int    `json:"priority" gorm:"default:0"`
}

func (ChannelSourceMapping) TableName() string {
	return "channel_source_mappings"
}

// GetChannelSourceMappings 获取所有映射配置
func GetChannelSourceMappings() ([]*ChannelSourceMapping, error) {
	var mappings []*ChannelSourceMapping
	err := DB.Order("priority ASC").Find(&mappings).Error
	return mappings, err
}

// GetChannelSourceMappingById 根据ID获取映射
func GetChannelSourceMappingById(id int) (*ChannelSourceMapping, error) {
	var mapping ChannelSourceMapping
	err := DB.First(&mapping, "id = ?", id).Error
	return &mapping, err
}

// CreateChannelSourceMapping 创建映射
func CreateChannelSourceMapping(mapping *ChannelSourceMapping) error {
	return DB.Create(mapping).Error
}

// UpdateChannelSourceMapping 更新映射
func UpdateChannelSourceMapping(mapping *ChannelSourceMapping) error {
	return DB.Save(mapping).Error
}

// DeleteChannelSourceMapping 删除映射
func DeleteChannelSourceMapping(id int) error {
	return DB.Delete(&ChannelSourceMapping{}, "id = ?", id).Error
}

// MatchChannelSource 根据 base_url 匹配渠道来源
// 先按 base_url_pattern 模糊匹配，再按优先级排序取第一个
func MatchChannelSource(baseURL string) string {
	if baseURL == "" {
		return ""
	}

	mappings, err := GetChannelSourceMappings()
	if err != nil || len(mappings) == 0 {
		return ""
	}

	for _, m := range mappings {
		if m.BaseURLPattern == "" {
			continue
		}
		// 支持通配符 * 的模糊匹配
		pattern := m.BaseURLPattern
		if strings.Contains(pattern, "*") {
			// 简单通配符：将 * 替换为通配逻辑
			if wildcardMatch(baseURL, pattern) {
				return m.SourceName
			}
		} else {
			// 精确包含匹配
			if strings.Contains(baseURL, pattern) {
				return m.SourceName
			}
		}
	}
	return ""
}

// wildcardMatch 简单的通配符匹配
func wildcardMatch(s, pattern string) bool {
	parts := strings.Split(pattern, "*")
	for i, part := range parts {
		if part == "" {
			continue
		}
		idx := strings.Index(s, part)
		if idx < 0 {
			return false
		}
		// 第一个 part 必须在开头匹配（如果 pattern 不以 * 开头）
		if i == 0 && !strings.HasPrefix(pattern, "*") && idx != 0 {
			return false
		}
		// 最后一个 part 必须在结尾匹配（如果 pattern 不以 * 结尾）
		if i == len(parts)-1 && !strings.HasSuffix(pattern, "*") && !strings.HasSuffix(s, part) {
			return false
		}
		s = s[idx+len(part):]
	}
	return true
}

// AutoFillChannelSource 自动填充渠道来源
// 如果渠道已有 source 则保留，否则根据 base_url 推断
func AutoFillChannelSource(channel *Channel) {
	if channel.Source != nil && *channel.Source != "" {
		return
	}
	source := MatchChannelSource(channel.GetBaseURL())
	if source != "" {
		channel.Source = &source
	}
}

// Source 字段：添加到 Channel 表
// 注意：该字段在 channel.go 中直接添加到 Channel struct

// GetDistinctSources 获取所有已有的渠道来源
func GetDistinctSources() ([]string, error) {
	var sources []string
	err := DB.Model(&Channel{}).
		Where("source IS NOT NULL AND source != ''").
		Distinct("source").
		Pluck("source", &sources).Error
	return sources, err
}

// InitSourceField 将 Source 字段添加到 Channel 结构体
// 这是一个辅助函数，用于在需要时将 *string 类型的 Source 字段安全地获取值
func (channel *Channel) GetSource() string {
	if channel.Source == nil {
		return ""
	}
	return *channel.Source
}

func (channel *Channel) SetSource(source string) {
	channel.Source = &source
}

func (channel *Channel) GetIsTestChannel() bool {
	if channel.IsTestChannel == nil {
		return false
	}
	return *channel.IsTestChannel == 1
}

func (channel *Channel) SetIsTestChannel(isTest bool) {
	val := 0
	if isTest {
		val = 1
	}
	channel.IsTestChannel = &val
}

// 需要在 Channel 结构体中添加以下字段：
// Source        *string `json:"source" gorm:"type:varchar(64);default:''"`
// IsTestChannel *int    `json:"is_test_channel" gorm:"default:0"`

// CreateDefaultSourceMappings 创建默认的来源映射（仅在首次迁移时调用）
func CreateDefaultSourceMappings() error {
	var count int64
	DB.Model(&ChannelSourceMapping{}).Count(&count)
	if count > 0 {
		return nil
	}

	defaults := []ChannelSourceMapping{
		{SourceName: "渠道A", BaseURLPattern: "*openai.com*", Priority: 1},
		{SourceName: "渠道B", BaseURLPattern: "*anthropic.com*", Priority: 2},
	}

	for _, d := range defaults {
		if err := DB.Create(&d).Error; err != nil {
			return err
		}
	}
	return nil
}
