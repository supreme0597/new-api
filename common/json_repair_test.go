package common

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestSafeUnmarshalToolCallArgs(t *testing.T) {
	tests := []struct {
		name    string
		args    string
		want    map[string]interface{}
		wantErr bool
	}{
		{
			name: "empty string returns nil without error",
			args: "",
			want: nil,
		},
		{
			name: "valid JSON passes through unchanged",
			args: `{"status":"in_progress","taskId":"2"}`,
			want: map[string]interface{}{"status": "in_progress", "taskId": "2"},
		},
		{
			name: "missing quotes on values - repaired",
			args: `{status:"in_progress",taskId:"2"}`,
			want: map[string]interface{}{"status": "in_progress", "taskId": "2"},
		},
		{
			name: "single quotes replaced with double quotes",
			args: `{'status':'in_progress','taskId':'2'}`,
			want: map[string]interface{}{"status": "in_progress", "taskId": "2"},
		},
		{
			name: "trailing comma removed",
			args: `{"status":"in_progress","taskId":"2",}`,
			want: map[string]interface{}{"status": "in_progress", "taskId": "2"},
		},
		{
			name: "markdown code block stripped",
			args: "```json\n{\"status\":\"in_progress\",\"taskId\":\"2\"}\n```",
			want: map[string]interface{}{"status": "in_progress", "taskId": "2"},
		},
		{
			name: "nested object",
			args: `{"config":{"enabled":true},"name":"test"}`,
			want: map[string]interface{}{
				"config": map[string]interface{}{"enabled": true},
				"name":   "test",
			},
		},
		{
			name:    "completely invalid returns error",
			args:    "not json at all {{{{",
			wantErr: true,
		},
		{
			name: "missing closing brace - repaired",
			args: `{"status":"done"`,
			want: map[string]interface{}{"status": "done"},
		},
		{
			name: "unquoted keys - repaired",
			args: `{status:"done",count:5}`,
			want: map[string]interface{}{"status": "done", "count": float64(5)},
		},
		{
			name: "the exact bug from the issue: inn_progress",
			args: `{status:"inn_progress",taskId:"2"}`,
			want: map[string]interface{}{"status": "inn_progress", "taskId": "2"},
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

func TestSafeUnmarshalToolCallArgs_InvalidJSON_StillFailsAfterRepair(t *testing.T) {
	var got map[string]interface{}
	err := SafeUnmarshalToolCallArgs("{{{{", &got)
	require.Error(t, err)
	require.Nil(t, got)
}
