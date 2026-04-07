package system_setting

import (
	"encoding/json"

	"github.com/QuantumNous/new-api/setting/config"
)

// LDAPSettings LDAP 配置结构（兼容 Yearning 格式）
type LDAPSettings struct {
	Enabled    bool   `json:"enabled"`     // 是否启用
	Url        string `json:"url"`         // LDAP 服务器地址（含端口，如 ldap.example.com:389）
	User       string `json:"user"`        // 绑定 DN（管理员账号）
	Password   string `json:"password"`    // 绑定密码
	Type       string `json:"type"`        // 搜索过滤器模板（如 "(employeeID=%s)" 或 "(sAMAccountName=%s)"）
	Sc         string `json:"sc"`          // 搜索基准 DN（Base DN）
	Ldaps      bool   `json:"ldaps"`       // 是否使用 LDAPS
	SkipTLS    bool   `json:"skip_tls"`    // 跳过 TLS 证书验证
	Map        string `json:"map"`         // 属性映射 JSON，如 {"real_name":"cn","email":"mail","department":"department"}
	TestUser   string `json:"test_user"`   // 测试用户
	TestPass   string `json:"test_pass"`   // 测试用户密码
}

// LDAPAttributeMap LDAP 属性映射
type LDAPAttributeMap struct {
	RealName   string `json:"real_name"`    // 真实姓名
	Email      string `json:"email"`        // 邮箱
	Department string `json:"department"`   // 部门
}

var defaultLDAPSettings = LDAPSettings{
	Enabled:  false,
	Url:      "ldap.example.com:389",
	User:     "",
	Password: "",
	Type:     "(employeeID=%s)",
	Sc:       "dc=example,dc=com",
	Ldaps:    false,
	SkipTLS:  false,
	Map:      `{"real_name":"cn","email":"mail","department":"department"}`,
}

func init() {
	config.GlobalConfig.Register("ldap", &defaultLDAPSettings)
}

func GetLDAPSettings() *LDAPSettings {
	return &defaultLDAPSettings
}

// GetAttributeMap 解析属性映射
func (s *LDAPSettings) GetAttributeMap() (*LDAPAttributeMap, error) {
	var attrMap LDAPAttributeMap
	if s.Map == "" {
		// 使用默认映射
		return &LDAPAttributeMap{
			RealName:   "cn",
			Email:      "mail",
			Department: "department",
		}, nil
	}
	err := json.Unmarshal([]byte(s.Map), &attrMap)
	if err != nil {
		return nil, err
	}
	return &attrMap, nil
}
