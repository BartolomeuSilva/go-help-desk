package user

import "time"

type Permission string

const (
	PermTicketsCreate  Permission = "tickets:create"
	PermTicketsRead    Permission = "tickets:read"
	PermTicketsUpdate  Permission = "tickets:update"
	PermTicketsReply   Permission = "tickets:reply"
	PermTicketsDelete  Permission = "tickets:delete"
	PermKBManage       Permission = "kb:manage"
	PermCannedManage   Permission = "canned:manage"
	PermTagsManage     Permission = "tags:manage"
	PermUsersManage    Permission = "users:manage"
	PermSettingsManage Permission = "settings:manage"
)

type RoleDetails struct {
	Name        string       `json:"name"`
	Description string       `json:"description"`
	Permissions []Permission `json:"permissions"`
	IsSystem    bool         `json:"is_system"`
	CreatedAt   time.Time    `json:"created_at"`
	UpdatedAt   time.Time    `json:"updated_at"`
}
