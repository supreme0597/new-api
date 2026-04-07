package ldap

import (
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/go-ldap/ldap/v3"
)

// ALdap LDAP 认证结构（参考 Yearning 实现）
type ALdap struct {
	system_setting.LDAPSettings
	ldapInfo
}

// ldapInfo 从 LDAP 获取的用户信息
type ldapInfo struct {
	RealName   string `json:"real_name"`
	Email      string `json:"email"`
	Department string `json:"department"`
}

// EmployeeInfo 员工信息
type EmployeeInfo struct {
	EmployeeID string
	Name       string
	Email      string
	Department string
}

// LdapConnect 连接 LDAP 并验证用户
// user: 员工工号
// pass: 用户密码
// isTest: 是否为测试连接
func (a *ALdap) LdapConnect(user, pass string, isTest bool) (bool, *EmployeeInfo, error) {
	var ld *ldap.Conn
	var err error

	// 建立 LDAP 连接
	if a.Ldaps {
		ld, err = ldap.DialTLS("tcp", a.Url, &tls.Config{InsecureSkipVerify: a.SkipTLS})
	} else {
		ld, err = ldap.Dial("tcp", a.Url)
		if err == nil && !a.SkipTLS {
			err = ld.StartTLS(&tls.Config{InsecureSkipVerify: a.SkipTLS})
		}
	}

	if err != nil {
		return false, nil, fmt.Errorf("连接 LDAP 失败：%w", err)
	}
	defer ld.Close()

	// 使用管理员账号绑定
	if err := ld.Bind(a.User, a.Password); err != nil {
		return false, nil, fmt.Errorf("LDAP 绑定失败：%w", err)
	}

	// 测试模式使用测试用户
	if isTest {
		user = a.TestUser
		pass = a.TestPass
	}

	// 搜索用户
	searchRequest := ldap.NewSearchRequest(
		a.Sc,
		ldap.ScopeWholeSubtree,
		ldap.NeverDerefAliases,
		0,
		0,
		false,
		fmt.Sprintf(a.Type, ldap.EscapeFilter(user)),
		getSearchAttributes(),
		nil,
	)

	sr, err := ld.Search(searchRequest)
	if err != nil {
		return false, nil, fmt.Errorf("LDAP 搜索失败：%w", err)
	}

	if len(sr.Entries) != 1 {
		return false, nil, errors.New("用户不存在或返回多条记录")
	}

	// 获取用户 DN
	userDN := sr.Entries[0].DN

	// 使用用户 DN 和密码绑定，验证密码
	if err := ld.Bind(userDN, pass); err != nil {
		return false, nil, errors.New("用户名或密码错误")
	}

	// 解析属性映射
	var info ldapInfo
	var attrMap *system_setting.LDAPAttributeMap
	attrMap, err = a.GetAttributeMap()
	if err != nil {
		info = parseDefaultAttributes(sr.Entries[0])
	} else {
		info.RealName = sr.Entries[0].GetAttributeValue(attrMap.RealName)
		info.Email = sr.Entries[0].GetAttributeValue(attrMap.Email)
		info.Department = sr.Entries[0].GetAttributeValue(attrMap.Department)
	}

	employeeInfo := &EmployeeInfo{
		EmployeeID: user,
		Name:       info.RealName,
		Email:      info.Email,
		Department: info.Department,
	}

	return true, employeeInfo, nil
}

// Authenticate 验证员工身份
func Authenticate(employeeID, password string) (bool, *EmployeeInfo, error) {
	settings := system_setting.GetLDAPSettings()
	if !settings.Enabled {
		return false, nil, fmt.Errorf("LDAP 未启用")
	}

	al := &ALdap{
		LDAPSettings: *settings,
	}

	return al.LdapConnect(employeeID, password, false)
}

// TestConnection 测试 LDAP 连接
func TestConnection() (bool, error) {
	settings := system_setting.GetLDAPSettings()
	if !settings.Enabled {
		return false, fmt.Errorf("LDAP 未启用")
	}

	al := &ALdap{
		LDAPSettings: *settings,
	}

	_, _, err := al.LdapConnect("", "", true)
	return err == nil, err
}

// GetSearchAttributes 获取搜索属性列表
func getSearchAttributes() []string {
	return []string{"dn", "cn", "mail", "department", "displayName", "givenName", "sn"}
}

// parseDefaultAttributes 使用默认属性映射解析
func parseDefaultAttributes(entry *ldap.Entry) ldapInfo {
	return ldapInfo{
		RealName:   entry.GetAttributeValue("cn"),
		Email:      entry.GetAttributeValue("mail"),
		Department: entry.GetAttributeValue("department"),
	}
}

// Marshal 序列化员工信息
func (e *EmployeeInfo) Marshal() string {
	data, _ := json.Marshal(e)
	return string(data)
}
