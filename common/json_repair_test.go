package common

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestRepairJSON(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		// === Required test cases from the plan ===

		// markdown fence
		{
			name:  "markdown fence stripped",
			input: "```json\n{\"a\":1}\n```",
			want:  `{"a":1}`,
		},
		// trailing comma
		{
			name:  "trailing comma removed",
			input: `{"a":1,}`,
			want:  `{"a":1}`,
		},
		// unclosed bracket
		{
			name:  "unclosed bracket repaired",
			input: `{"a":[1,2`,
			want:  `{"a":[1,2]}`,
		},
		// unquoted key
		{
			name:  "unquoted key fixed",
			input: `{status:"done"}`,
			want:  `{"status":"done"}`,
		},
		// inn_progress bug (the exact issue)
		{
			name:  "inn_progress bug",
			input: `{status:"inn_progress",taskId:"2"}`,
			want:  `{"status":"inn_progress","taskId":"2"}`,
		},
		// valid JSON passthrough
		{
			name:  "valid json passthrough",
			input: `{"a":1,"b":"hello"}`,
			want:  `{"a":1,"b":"hello"}`,
		},
		// empty string
		{
			name:  "empty string",
			input: "",
			want:  "",
		},
		// invalid json fallback (return original)
		{
			name:  "invalid json returns original",
			input: `not json at all {{{{`,
			want:  `not json at all {{{{`,
		},

		// === Additional edge cases ===

		// nested object with unquoted keys
		{
			name:  "nested unquoted keys",
			input: `{config:{enabled:true},name:"test"}`,
			want:  `{"config":{"enabled":true},"name":"test"}`,
		},
		// markdown with ``` tag
		{
			name:  "markdown fence with tag",
			input: "```\n{\"a\":1}\n```",
			want:  `{"a":1}`,
		},
		// trailing comma in array
		{
			name:  "trailing comma in array",
			input: `[1,2,3,]`,
			want:  `[1,2,3]`,
		},
		// multiple trailing commas
		{
			name:  "multiple trailing commas",
			input: `{"a":1,"b":[1,2,],}`,
			want:  `{"a":1,"b":[1,2]}`,
		},
		// unclosed nested brackets
		{
			name:  "unclosed nested brackets",
			input: `{"a":{"b":[1`,
			want:  `{"a":{"b":[1]}}`,
		},
		// unquoted key with number value
		{
			name:  "unquoted key with number value",
			input: `{count:5,active:true}`,
			want:  `{"count":5,"active":true}`,
		},
		// whitespace handling
		{
			name:  "whitespace around input",
			input: `  {"a":1}  `,
			want:  `{"a":1}`,
		},
		// single-element array
		{
			name:  "valid single element array",
			input: `["hello"]`,
			want:  `["hello"]`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := RepairJSON(tt.input)
			require.Equal(t, tt.want, got)
			// If the result differs from input, it was repaired and must be valid JSON
			if got != "" && got != tt.input {
				var probe any
				err := json.Unmarshal([]byte(got), &probe)
				require.NoError(t, err, "RepairJSON should produce valid JSON after repair, got: %s", got)
			}
		})
	}
}

func TestSafeUnmarshalToolCallArgs(t *testing.T) {
	tests := []struct {
		name    string
		args    string
		want    map[string]interface{}
		wantErr bool
	}{
		{
			name: "empty string",
			args: "",
			want: nil,
		},
		{
			name: "valid JSON passthrough",
			args: `{"status":"in_progress","taskId":"2"}`,
			want: map[string]interface{}{"status": "in_progress", "taskId": "2"},
		},
		{
			name: "unquoted keys repaired",
			args: `{status:"in_progress",taskId:"2"}`,
			want: map[string]interface{}{"status": "in_progress", "taskId": "2"},
		},
		{
			name: "trailing comma repaired",
			args: `{"status":"in_progress","taskId":"2",}`,
			want: map[string]interface{}{"status": "in_progress", "taskId": "2"},
		},
		{
			name: "markdown fence stripped",
			args: "```json\n{\"status\":\"done\"}\n```",
			want: map[string]interface{}{"status": "done"},
		},
		{
			name: "inn_progress bug (exact issue)",
			args: `{status:"inn_progress",taskId:"2"}`,
			want: map[string]interface{}{"status": "inn_progress", "taskId": "2"},
		},
		{
			name: "unclosed bracket repaired",
			args: `{"a":[1,2`,
			want: map[string]interface{}{"a": []interface{}{float64(1), float64(2)}},
		},
		{
			name:    "completely invalid returns error",
			args:    `not json at all {{{{`,
			wantErr: true,
		},
		{
			name: "nested object repaired",
			args: `{config:{enabled:true},name:"test"}`,
			want: map[string]interface{}{
				"config": map[string]interface{}{"enabled": true},
				"name":   "test",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var got map[string]interface{}
			err := SafeUnmarshalToolCallArgs(tt.args, &got)
			if tt.wantErr {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			require.Equal(t, tt.want, got)
		})
	}
}
