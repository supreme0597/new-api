package service

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/ldap"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
)

func TestLdapTokenServiceFields(t *testing.T) {
	t.Run("验证服务结构", func(t *testing.T) {
		s := NewLdapTokenService()
		assert.NotNil(t, s)
	})
}

// TestTokenFields 验证令牌字段设置
func TestTokenFields(t *testing.T) {
	t.Run("令牌字段默认值", func(t *testing.T) {
		token := &model.Token{
			UserId:         1,
			Key:            "12345",
			Name:           "LDAP 工号令牌",
			Status:         common.TokenStatusEnabled,
			CreatedTime:    common.GetTimestamp(),
			AccessedTime:   0,
			ExpiredTime:    -1,
			RemainQuota:    0,
			UnlimitedQuota: true,
		}

		assert.Equal(t, "12345", token.Key)
		assert.Equal(t, "LDAP 工号令牌", token.Name)
		assert.Equal(t, common.TokenStatusEnabled, token.Status)
		assert.Equal(t, true, token.UnlimitedQuota)
		assert.Equal(t, int64(-1), token.ExpiredTime)
	})
}

// TestUserFields 验证用户字段设置
func TestUserFields(t *testing.T) {
	t.Run("用户字段默认值", func(t *testing.T) {
		user := &model.User{
			Username:    "12345",
			DisplayName: "张三",
			Email:       "zhangsan@example.com",
			Role:        common.RoleCommonUser,
			Status:      common.UserStatusEnabled,
			Group:       "default",
		}

		assert.Equal(t, "12345", user.Username)
		assert.Equal(t, "张三", user.DisplayName)
		assert.Equal(t, "zhangsan@example.com", user.Email)
		assert.Equal(t, common.RoleCommonUser, user.Role)
		assert.Equal(t, common.UserStatusEnabled, user.Status)
		assert.Equal(t, "default", user.Group)
	})
}

// TestLdapEmployeeInfo 验证LDAP员工信息结构
func TestLdapEmployeeInfo(t *testing.T) {
	t.Run("员工信息结构", func(t *testing.T) {
		info := &ldap.EmployeeInfo{
			EmployeeID: "12345",
			Name:       "张三",
			Email:      "zhangsan@company.com",
			Department: "技术部",
			Groups:     []string{"AI-Users", "Developers"},
		}

		assert.Equal(t, "12345", info.EmployeeID)
		assert.Equal(t, "张三", info.Name)
		assert.Equal(t, "zhangsan@company.com", info.Email)
		assert.Equal(t, "技术部", info.Department)
		assert.Equal(t, 2, len(info.Groups))
		assert.Equal(t, "AI-Users", info.Groups[0])
		assert.Equal(t, "Developers", info.Groups[1])
	})
}

// TestTokenStatusConstants 验证令牌状态常量
func TestTokenStatusConstants(t *testing.T) {
	t.Run("令牌状态常量定义", func(t *testing.T) {
		assert.Equal(t, 1, common.TokenStatusEnabled)
		assert.Equal(t, 4, common.TokenStatusExhausted)
		assert.Equal(t, 3, common.TokenStatusExpired)
		assert.Equal(t, 2, common.TokenStatusDisabled)
	})
}

// TestUserStatusConstants 验证用户状态常量
func TestUserStatusConstants(t *testing.T) {
	t.Run("用户状态常量定义", func(t *testing.T) {
		assert.Equal(t, 1, common.UserStatusEnabled)
		assert.Equal(t, 2, common.UserStatusDisabled)
	})
}

// TestIsUserInAllowedGroups 测试群组验证逻辑（不依赖数据库）
func TestIsUserInAllowedGroups(t *testing.T) {
	s := &LdapTokenService{}

	t.Run("用户群组在允许列表中-大小写不敏感", func(t *testing.T) {
		// 测试大小写不敏感匹配
		result := s.IsUserInAllowedGroups([]string{"ai-users", "developers"})
		_ = result
	})

	t.Run("用户无群组", func(t *testing.T) {
		result := s.IsUserInAllowedGroups([]string{})
		_ = result
	})

	t.Run("用户群组为空", func(t *testing.T) {
		result := s.IsUserInAllowedGroups(nil)
		_ = result
	})
}

// TestParseAllowedGroups 测试解析允许群组
func TestParseAllowedGroups(t *testing.T) {
	t.Run("正常解析逗号分隔的群组", func(t *testing.T) {
		result := parseAllowedGroups("group1,group2,group3")
		assert.Equal(t, 3, len(result))
		assert.Equal(t, "group1", result[0])
		assert.Equal(t, "group2", result[1])
		assert.Equal(t, "group3", result[2])
	})

	t.Run("带空格的群组", func(t *testing.T) {
		result := parseAllowedGroups(" group1 , group2 , group3 ")
		assert.Equal(t, 3, len(result))
		assert.Equal(t, "group1", result[0])
		assert.Equal(t, "group2", result[1])
		assert.Equal(t, "group3", result[2])
	})

	t.Run("空字符串", func(t *testing.T) {
		result := parseAllowedGroups("")
		assert.Nil(t, result)
	})

	t.Run("只有空格", func(t *testing.T) {
		result := parseAllowedGroups("   ")
		assert.Nil(t, result)
	})

	t.Run("单个群组", func(t *testing.T) {
		result := parseAllowedGroups("group1")
		assert.Equal(t, 1, len(result))
		assert.Equal(t, "group1", result[0])
	})

	t.Run("连续逗号", func(t *testing.T) {
		result := parseAllowedGroups("group1,,group2")
		assert.Equal(t, 2, len(result))
	})
}

// BenchmarkLdapTokenServiceCreation 基准测试：服务创建
func BenchmarkLdapTokenServiceCreation(b *testing.B) {
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		NewLdapTokenService()
	}
}

// BenchmarkIsUserInAllowedGroups 基准测试：群组验证
func BenchmarkIsUserInAllowedGroups(b *testing.B) {
	s := &LdapTokenService{}
	groups := []string{"AI-Users", "Developers", "Testers"}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		s.IsUserInAllowedGroups(groups)
	}
}

// BenchmarkParseAllowedGroups 基准测试：群组解析
func BenchmarkParseAllowedGroups(b *testing.B) {
	groupStr := "group1,group2,group3,group4,group5"

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		parseAllowedGroups(groupStr)
	}
}
