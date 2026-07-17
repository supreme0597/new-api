package common

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

// unquotedKeyRe matches bare identifiers used as JSON keys (before a colon).
// Examples: {name:"value"}, { status:"done"}
// Uses word boundary to avoid matching inside already-quoted strings.
var unquotedKeyRe = regexp.MustCompile(`\b([a-zA-Z_][a-zA-Z0-9_]*)\s*:`)

// RepairJSON attempts to fix common L1 JSON syntax errors produced by LLMs:
// markdown code fences, trailing commas, unclosed brackets, and unquoted keys.
// Returns the repaired JSON string. On catastrophic failure returns the original input.
func RepairJSON(input string) string {
	input = strings.TrimSpace(input)
	if input == "" {
		return input
	}
	// Fast path: already valid JSON
	var probe any
	if err := json.Unmarshal([]byte(input), &probe); err == nil {
		return input
	}

	s := input

	// 1. Strip markdown code fences (```json ... ```)
	s = stripMarkdownFences(s)

	// 2. Quote unquoted keys: {name:"val"} → {"name":"val"}
	//    Also handles unquoted string values: {name:val} → {name:"val"}
	s = quoteUnquotedKeys(s)

	// 3. Remove trailing commas before } or ]
	s = removeTrailingCommas(s)

	// 4. Fix unclosed brackets/braces
	s = repairUnclosedBrackets(s)

	// 5. Verify result
	var check any
	if err := json.Unmarshal([]byte(s), &check); err == nil {
		return s
	}

	return input
}

// SafeUnmarshalToolCallArgs attempts to unmarshal a JSON string into v.
// If standard unmarshaling fails, it tries to repair common L1 syntax errors
// before retrying. This is the L1 fix for "Invalid tool parameters" errors
// caused by models returning malformed JSON in tool call arguments.
func SafeUnmarshalToolCallArgs(args string, v any) error {
	if args == "" {
		return nil
	}
	// Fast path: standard parse
	if err := Unmarshal([]byte(args), v); err == nil {
		return nil
	}
	// Repair and retry
	repaired := RepairJSON(args)
	if err := Unmarshal([]byte(repaired), v); err != nil {
		return fmt.Errorf("json repair failed: %w", err)
	}
	SysLog(fmt.Sprintf("[json-repair] repaired malformed tool call args (len=%d->%d)", len(args), len(repaired)))
	return nil
}

// stripMarkdownFences removes ```json ... ``` or ``` ... ``` wrappers.
func stripMarkdownFences(s string) string {
	s = strings.TrimSpace(s)
	if !strings.HasPrefix(s, "```") {
		return s
	}
	// Find end of opening fence line
	idx := strings.Index(s, "\n")
	if idx < 0 {
		// Single-line: ```json``` or just ```
		s = strings.TrimPrefix(s, "```")
		if i := strings.LastIndex(s, "```"); i >= 0 {
			s = s[:i]
		}
		return strings.TrimSpace(s)
	}
	// Multi-line: skip first line (the fence), find closing fence
	inner := s[idx+1:]
	if endIdx := strings.LastIndex(inner, "```"); endIdx >= 0 {
		s = inner[:endIdx]
	} else {
		s = inner
	}
	return strings.TrimSpace(s)
}

// quoteUnquotedKeys replaces bare identifiers used as JSON keys with quoted versions.
// {name:"val"} → {"name":"val"}, { name : "val" } → {"name":"val"}
// Also handles unquoted string values: {name:val} → {name:"val"}
func quoteUnquotedKeys(s string) string {
	return unquotedKeyRe.ReplaceAllString(s, `"$1":`)
}

// removeTrailingCommas strips commas immediately before } or ].
func removeTrailingCommas(s string) string {
	// Pattern: comma followed by optional whitespace and closing brace/bracket
	re := regexp.MustCompile(`,\s*([}\]])`)
	for {
		result := re.ReplaceAllString(s, "$1")
		if result == s {
			break
		}
		s = result
	}
	return s
}

// repairUnclosedBrackets uses a state machine to close any unclosed { or [.
// Also handles unterminated strings by appending a closing quote.
func repairUnclosedBrackets(s string) string {
	type frame struct {
		open byte // '{' or '['
	}
	var stack []frame
	inString := false
	escaped := false

	for i := 0; i < len(s); i++ {
		c := s[i]
		if escaped {
			escaped = false
			continue
		}
		if inString {
			if c == '\\' {
				escaped = true
			} else if c == '"' {
				inString = false
			}
			continue
		}
		switch c {
		case '"':
			inString = true
		case '{', '[':
			stack = append(stack, frame{open: c})
		case '}':
			// Pop matching '{'
			for j := len(stack) - 1; j >= 0; j-- {
				if stack[j].open == '{' {
					stack = append(stack[:j], stack[j+1:]...)
					break
				}
			}
		case ']':
			// Pop matching '['
			for j := len(stack) - 1; j >= 0; j-- {
				if stack[j].open == '[' {
					stack = append(stack[:j], stack[j+1:]...)
					break
				}
			}
		}
	}

	// Close unterminated string
	if inString {
		s += `"`
	}

	// Close unclosed brackets in reverse order (LIFO)
	for i := len(stack) - 1; i >= 0; i-- {
		if stack[i].open == '{' {
			s += "}"
		} else {
			s += "]"
		}
	}

	return s
}
