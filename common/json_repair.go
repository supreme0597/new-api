package common

import (
	"fmt"

	"github.com/kaptinlin/jsonrepair"
)

// SafeUnmarshalToolCallArgs attempts to unmarshal a JSON string into v.
// If standard unmarshaling fails, it tries to repair common LLM JSON syntax
// errors (missing quotes, single quotes, trailing commas, markdown wrapping)
// before retrying. This is the L1 fix for "Invalid tool parameters" errors
// caused by models returning malformed JSON in tool call arguments.
func SafeUnmarshalToolCallArgs(args string, v any) error {
	if args == "" {
		return nil
	}
	if err := Unmarshal([]byte(args), v); err == nil {
		return nil
	}
	// Standard parse failed — try repair
	repaired, repairErr := jsonrepair.Repair(args)
	if repairErr != nil {
		return fmt.Errorf("json repair failed: %w", repairErr)
	}
	if err := Unmarshal([]byte(repaired), v); err != nil {
		return fmt.Errorf("repaired json still invalid: %w", err)
	}
	SysLog(fmt.Sprintf("[json-repair] repaired malformed tool call args (len=%d->%d)", len(args), len(repaired)))
	return nil
}
