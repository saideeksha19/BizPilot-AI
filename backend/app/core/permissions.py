from __future__ import annotations

from enum import Enum

from app.models.enums import MembershipRole


class Permission(str, Enum):
    BUSINESS_READ = "business:read"
    BUSINESS_UPDATE = "business:update"
    BUSINESS_DELETE = "business:delete"
    SETTINGS_SENSITIVE = "settings:sensitive"
    MEMBERSHIP_READ = "membership:read"
    MEMBERSHIP_INVITE = "membership:invite"
    MEMBERSHIP_UPDATE_ROLE = "membership:update_role"
    MEMBERSHIP_REMOVE = "membership:remove"
    FINANCIAL_READ = "financial:read"
    FINANCIAL_WRITE = "financial:write"
    FINANCIAL_DELETE = "financial:delete"
    AUDIT_READ = "audit:read"


ROLE_PERMISSIONS: dict[MembershipRole, frozenset[Permission]] = {
    MembershipRole.OWNER: frozenset(
        {
            Permission.BUSINESS_READ,
            Permission.BUSINESS_UPDATE,
            Permission.BUSINESS_DELETE,
            Permission.SETTINGS_SENSITIVE,
            Permission.MEMBERSHIP_READ,
            Permission.MEMBERSHIP_INVITE,
            Permission.MEMBERSHIP_UPDATE_ROLE,
            Permission.MEMBERSHIP_REMOVE,
            Permission.FINANCIAL_READ,
            Permission.FINANCIAL_WRITE,
            Permission.FINANCIAL_DELETE,
            Permission.AUDIT_READ,
        }
    ),
    MembershipRole.ADMIN: frozenset(
        {
            Permission.BUSINESS_READ,
            Permission.BUSINESS_UPDATE,
            Permission.MEMBERSHIP_READ,
            Permission.MEMBERSHIP_INVITE,
            Permission.MEMBERSHIP_UPDATE_ROLE,
            Permission.MEMBERSHIP_REMOVE,
            Permission.FINANCIAL_READ,
            Permission.FINANCIAL_WRITE,
            Permission.FINANCIAL_DELETE,
            Permission.AUDIT_READ,
        }
    ),
    MembershipRole.MANAGER: frozenset(
        {
            Permission.BUSINESS_READ,
            Permission.MEMBERSHIP_READ,
            Permission.FINANCIAL_READ,
            Permission.FINANCIAL_WRITE,
        }
    ),
    MembershipRole.VIEWER: frozenset(
        {
            Permission.BUSINESS_READ,
            Permission.MEMBERSHIP_READ,
            Permission.FINANCIAL_READ,
        }
    ),
}


def has_permission(role: MembershipRole, permission: Permission) -> bool:
    """Return True when the membership role grants the requested permission."""
    return permission in ROLE_PERMISSIONS.get(role, frozenset())


def get_role_permissions(role: MembershipRole) -> list[str]:
    """Return sorted list of permission strings granted to the given role."""
    return sorted(perm.value for perm in ROLE_PERMISSIONS.get(role, frozenset()))
