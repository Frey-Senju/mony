"""
Centralized UUID parsing helper for Mony API (resolves TD-3).
"""

from uuid import UUID
from fastapi import HTTPException, status


def parse_uuid(value: str | UUID, field_name: str = "id") -> UUID:
    """Parse a string or UUID into a ``UUID`` instance or raise HTTP 400."""
    if isinstance(value, UUID):
        return value
    try:
        return UUID(str(value))
    except (ValueError, TypeError, AttributeError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid UUID for {field_name}",
        )
