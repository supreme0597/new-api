package service

import (
	"fmt"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/ldap"
	"github.com/QuantumNous/new-api/model"
	"gorm.io/gorm"
)

type LdapTokenService struct{}

// NewLdapTokenService 创建 LDAP 令牌服务
func NewLdapTokenService() *LdapTokenService {
	return &LdapTokenService{}
}

// AuthenticateAndCreateToken 通过工号认证并创建令牌
// 返回：user, token, error
func (s *LdapTokenService) AuthenticateAndCreateToken(employeeID, password string) (*model.User, *model.Token, error) {
	// 1. LDAP 认证并获取员工信息
	valid, employeeInfo, err := ldap.Authenticate(employeeID, password)
	if err != nil {
		return nil, nil, fmt.Errorf("LDAP 认证失败：%w", err)
	}
	if !valid {
		return nil, nil, fmt.Errorf("工号或密码错误")
	}

	// 2. 查找或创建用户
	user, err := s.FindOrCreateUser(employeeID, employeeInfo)
	if err != nil {
		return nil, nil, fmt.Errorf("用户创建失败：%w", err)
	}

	// 3. 查找或创建令牌 (key=工号)
	token, err := s.FindOrCreateToken(user.Id, employeeID)
	if err != nil {
		return nil, nil, fmt.Errorf("令牌创建失败：%w", err)
	}

	return user, token, nil
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
