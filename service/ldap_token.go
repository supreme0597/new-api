package service

import (
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/ldap"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"gorm.io/gorm"
)

type LdapTokenService struct{}

// NewLdapTokenService 创建 LDAP 令牌服务
func NewLdapTokenService() *LdapTokenService {
	return &LdapTokenService{}
}

// AuthenticateByEmployeeID 通过工号认证并创建令牌（无需密码）
// 逻辑：令牌优先，避免每次都调用LDAP
// 1. 先查令牌是否存在
// 2. 令牌存在 → 直接返回，跳过LDAP
// 3. 令牌不存在 → LDAP查用户是否存在
// 4. 用户存在于LDAP中 → 检查群组是否允许
// 5. 群组允许 → 创建用户+令牌
// 6. 群组不允许 → 拒绝
func (s *LdapTokenService) AuthenticateByEmployeeID(employeeID string) (*model.User, *model.Token, error) {
	// 0. 检查是否允许工号作为 API Key
	ldapSettings := system_setting.GetLDAPSettings()
	if !ldapSettings.EnableTokenAsApiKey {
		return nil, nil, fmt.Errorf("LDAP 工号令牌认证已被管理员禁用")
	}

	// 1. 先尝试查找令牌（不验证LDAP）
	token, err := s.findTokenByKey(employeeID)
	if err == nil && token != nil {
		// 令牌已存在，检查是否属于该用户
		user, err := s.getUserById(token.UserId)
		if err != nil {
			return nil, nil, fmt.Errorf("获取用户失败：%w", err)
		}
		// 检查令牌状态
		if token.Status != common.TokenStatusEnabled {
			return nil, nil, fmt.Errorf("令牌已禁用")
		}
		// 令牌存在且有效，直接返回（跳过LDAP）
		return user, token, nil
	}

	// 2. 令牌不存在，需要LDAP查询用户是否存在
	ldapUserInfo, err := ldap.LookupUser(employeeID)
	if err != nil || ldapUserInfo == nil {
		// 用户不存在于LDAP中，拒绝
		return nil, nil, fmt.Errorf("用户不在LDAP中，请联系管理员")
	}

	// 3. 检查用户群组是否在允许列表中
	if !s.IsUserInAllowedGroups(ldapUserInfo.Groups) {
		return nil, nil, fmt.Errorf("用户不在允许的群组中，无法访问系统")
	}

	// 4. 用户存在于LDAP中且群组允许，查找或创建用户
	user, err := s.FindOrCreateUser(employeeID, ldapUserInfo)
	if err != nil {
		return nil, nil, fmt.Errorf("用户创建失败：%w", err)
	}

	// 5. 查找或创建令牌 (key=工号)
	token, err = s.FindOrCreateToken(user.Id, employeeID)
	if err != nil {
		return nil, nil, fmt.Errorf("令牌创建失败：%w", err)
	}

	return user, token, nil
}

// IsUserInAllowedGroups 检查用户是否在允许的群组中
func (s *LdapTokenService) IsUserInAllowedGroups(userGroups []string) bool {
	settings := system_setting.GetLDAPSettings()
	allowedGroups := settings.AllowedGroups

	// 如果没有配置允许的群组，则允许所有LDAP用户
	if allowedGroups == "" {
		return true
	}

	// 解析允许的群组列表
	allowedList := parseAllowedGroups(allowedGroups)
	if len(allowedList) == 0 {
		return true
	}

	// 检查用户群组是否在允许列表中
	for _, userGroup := range userGroups {
		for _, allowed := range allowedList {
			if strings.EqualFold(strings.TrimSpace(userGroup), strings.TrimSpace(allowed)) {
				return true
			}
		}
	}

	return false
}

// parseAllowedGroups 解析允许的群组列表
func parseAllowedGroups(allowedGroups string) []string {
	if allowedGroups == "" {
		return nil
	}

	var groups []string
	for _, g := range strings.Split(allowedGroups, ",") {
		g = strings.TrimSpace(g)
		if g != "" {
			groups = append(groups, g)
		}
	}
	return groups
}

// FindOrCreateUser 查找或创建用户
func (s *LdapTokenService) FindOrCreateUser(employeeID string, info *ldap.EmployeeInfo) (*model.User, error) {
	// 尝试通过用户名查找 (username=employeeID)
	user := model.User{}
	err := model.DB.Where("username = ?", employeeID).First(&user).Error
	if err == nil {
		// 用户已存在
		return &user, nil
	}
	if err != gorm.ErrRecordNotFound {
		return nil, err
	}

	// 用户不存在，创建新用户
	username := employeeID
	displayName := info.Name
	if displayName == "" {
		displayName = employeeID
	}

	newUser := &model.User{
		Username:    username,
		DisplayName: displayName,
		Email:       info.Email,
		Role:        common.RoleCommonUser, // 普通用户
		Status:      1,                     // 启用状态
		Group:       "default",
	}

	// 不需要密码，因为这是 LDAP 认证
	// 设置一个随机密码占位符 (实际不会用于登录)
	randomPassword := common.GetRandomString(32)
	newUser.Password, err = common.Password2Hash(randomPassword)
	if err != nil {
		return nil, fmt.Errorf("密码加密失败：%w", err)
	}

	// 创建用户
	err = model.DB.Create(newUser).Error
	if err != nil {
		return nil, fmt.Errorf("创建用户失败：%w", err)
	}

	return newUser, nil
}

// findTokenByKey 私有方法：通过 key 查找令牌
func (s *LdapTokenService) findTokenByKey(key string) (*model.Token, error) {
	token := model.Token{}
	err := model.DB.Where("`key` = ?", key).First(&token).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, err
	}
	return &token, nil
}

// getUserById 私有方法：通过 ID 查找用户
func (s *LdapTokenService) getUserById(userId int) (*model.User, error) {
	user := model.User{}
	err := model.DB.First(&user, userId).Error
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// FindOrCreateToken 查找或创建令牌 (key=employeeID)
func (s *LdapTokenService) FindOrCreateToken(userId int, employeeID string) (*model.Token, error) {
	// 尝试通过 key 查找
	token := model.Token{}
	err := model.DB.Where("key = ?", employeeID).First(&token).Error
	if err == nil {
		// 令牌已存在，检查是否属于该用户
		if token.UserId != userId {
			return nil, fmt.Errorf("令牌不属于该用户")
		}
		// 检查令牌状态
		if token.Status != common.TokenStatusEnabled {
			return nil, fmt.Errorf("令牌已禁用")
		}
		return &token, nil
	}
	if err != gorm.ErrRecordNotFound {
		return nil, err
	}

	// 令牌不存在，创建新令牌
	// 注意：key 直接使用 employeeID，不使用 sk-前缀
	newToken := &model.Token{
		UserId:             userId,
		Key:                employeeID, // 令牌值为工号
		Name:               "LDAP 工号令牌",
		Status:             common.TokenStatusEnabled,
		CreatedTime:        common.GetTimestamp(),
		AccessedTime:       0,
		ExpiredTime:        -1, // 永不过期
		RemainQuota:        0,
		UnlimitedQuota:     true, // 默认无限额度
		ModelLimitsEnabled: false,
		AllowIps:           nil,
		UsedQuota:          0,
		Group:              "default",
		CrossGroupRetry:    false,
	}

	// 创建令牌
	err = model.DB.Create(newToken).Error
	if err != nil {
		return nil, fmt.Errorf("创建令牌失败：%w", err)
	}

	return newToken, nil
}
