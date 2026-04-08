package service

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/system_setting"
)

func GetCallbackAddress() string {
	if operation_setting.CustomCallbackAddress == "" {
		return system_setting.ServerAddress + common.ContextPath
	}
	return operation_setting.CustomCallbackAddress
}

// CallbackURL returns the full callback URL with context path prefix.
// Usage: CallbackURL("/api/user/epay/notify")
func CallbackURL(path string) string {
	return GetCallbackAddress() + path
}
