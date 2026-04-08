package system_setting

import "github.com/QuantumNous/new-api/common"

var ServerAddress = "http://localhost:3000"
var WorkerUrl = ""
var WorkerValidKey = ""
var WorkerAllowHttpImageRequestEnabled = false

func EnableWorker() bool {
	return WorkerUrl != ""
}

// ServerURL returns the full URL with ContextPath prefix.
// Usage: ServerURL("/oauth/discord") => "http://localhost:3000/newapi/oauth/discord"
func ServerURL(path string) string {
	return ServerAddress + common.ContextPath + path
}
