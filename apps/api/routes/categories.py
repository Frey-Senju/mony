"""
Category management endpoints for Mony API.

Provides CRUD for user transaction categories and automatic seeding of
default Brazilian personal-finance categories aligned with AI Insights
auto-categorization keywords.

Endpoints:
  GET    /categories       — list user categories (auto-seeds defaults if empty)
  POST   /categories       — create custom category
  PUT    /categories/{id}  — update category
  DELETE /categories/{id}  — soft-delete non-system category
"""

import re
import unicodedata
from datetime import datetime
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from database.base import get_db
from database.models import Category, User
from utils.auth import get_current_user_from_header
from utils.uuid_utils import parse_uuid

router = APIRouter(prefix="/categories", tags=["categories"])

DEFAULT_CATEGORIES: list[dict[str, str]] = [
    {"name": "Alimentação", "slug": "alimentacao", "icon": "🍔", "color": "#F59E0B", "description": "Restaurantes, supermercados e delivery"},
    {"name": "Transporte", "slug": "transporte", "icon": "🚗", "color": "#3B82F6", "description": "Combustível, aplicativos e transporte público"},
    {"name": "Moradia", "slug": "moradia", "icon": "🏠", "color": "#EC4899", "description": "Aluguel, condomínio, energia e internet"},
    {"name": "Saúde", "slug": "saude", "icon": "⚕️", "color": "#EF4444", "description": "Farmácia, consultas, exames e academia"},
    {"name": "Lazer", "slug": "lazer", "icon": "🎮", "color": "#8B5CF6", "description": "Streaming, cinema, viagens e entretenimento"},
    {"name": "Educação", "slug": "educacao", "icon": "📚", "color": "#06B6D4", "description": "Cursos, livros e mensalidades"},
    {"name": "Vestuário", "slug": "vestuario", "icon": "👕", "color": "#14B8A6", "description": "Roupas, calçados e acessórios"},
    {"name": "Viagem", "slug": "viagem", "icon": "✈️", "color": "#6366F1", "description": "Hospedagem, passagens e passeios"},
    {"name": "Trabalho", "slug": "trabalho", "icon": "💼", "color": "#10B981", "description": "Salário, freelances e receitas profissionais"},
    {"name": "Outros", "slug": "outros", "icon": "📦", "color": "#6B7280", "description": "Despesas e receitas diversas"},
]


def _slugify(name: str) -> str:
    nfkd = unicodedata.normalize("NFKD", name.strip().lower())
    ascii_str = "".join(c for c in nfkd if not unicodedata.combining(c))
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_str).strip("-")
    return slug[:100] or "categoria"


def ensure_default_categories(db: Session, user_id: UUID) -> list[Category]:
    """Ensure a user has default categories seeded. Idempotent."""
    existing = (
        db.query(Category)
        .filter(Category.user_id == user_id, Category.deleted_at.is_(None))
        .order_by(Category.is_system.desc(), Category.name.asc())
        .all()
    )
    if existing:
        return existing

    # Check if any soft-deleted slugs exist so we avoid unique constraint violations
    existing_slugs = {
        row[0]
        for row in db.query(Category.slug)
        .filter(Category.user_id == user_id)
        .all()
        if row[0]
    }

    created: list[Category] = []
    for item in DEFAULT_CATEGORIES:
        if item["slug"] in existing_slugs:
            continue
        cat = Category(
            user_id=user_id,
            name=item["name"],
            slug=item["slug"],
            icon=item["icon"],
            color=item["color"],
            description=item["description"],
            is_system=True,
        )
        db.add(cat)
        created.append(cat)

    if created:
        db.commit()
        for cat in created:
            db.refresh(cat)

    return (
        db.query(Category)
        .filter(Category.user_id == user_id, Category.deleted_at.is_(None))
        .order_by(Category.is_system.desc(), Category.name.asc())
        .all()
    )


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    color: str = Field(default="#3B82F6", pattern=r"^#[0-9A-Fa-f]{6}$")
    icon: Optional[str] = Field(default="🏷️", max_length=50)
    description: Optional[str] = Field(default=None, max_length=500)


class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    color: Optional[str] = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    icon: Optional[str] = Field(default=None, max_length=50)
    description: Optional[str] = Field(default=None, max_length=500)


class CategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: Optional[str] = None
    color: Optional[str] = "#6B7280"
    icon: Optional[str] = "🏷️"
    description: Optional[str] = None
    is_system: bool = False
    is_default: bool = False
    created_at: datetime

    @classmethod
    def from_orm_category(cls, cat: Category) -> "CategoryResponse":
        return cls(
            id=cat.id,
            name=cat.name,
            slug=cat.slug,
            color=cat.color or "#6B7280",
            icon=cat.icon or "🏷️",
            description=cat.description,
            is_system=bool(cat.is_system),
            is_default=bool(cat.is_system),
            created_at=cat.created_at,
        )


@router.get("", response_model=List[CategoryResponse])
async def list_categories(
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """List all active categories for the authenticated user, seeding defaults if needed."""
    uid = parse_uuid(user_id, "user_id")
    user = db.query(User).filter(User.id == uid).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    categories = ensure_default_categories(db, uid)
    return [CategoryResponse.from_orm_category(c) for c in categories]


@router.post("", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_category(
    payload: CategoryCreate,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """Create a custom category for the authenticated user."""
    uid = parse_uuid(user_id, "user_id")
    user = db.query(User).filter(User.id == uid).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    slug = _slugify(payload.name)
    existing = (
        db.query(Category)
        .filter(
            Category.user_id == uid,
            Category.slug == slug,
            Category.deleted_at.is_(None),
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Category '{payload.name}' already exists",
        )

    # Reactivate soft-deleted category with same slug if present
    deleted_existing = (
        db.query(Category)
        .filter(Category.user_id == uid, Category.slug == slug, Category.deleted_at.isnot(None))
        .first()
    )
    if deleted_existing:
        deleted_existing.name = payload.name.strip()
        deleted_existing.color = payload.color
        deleted_existing.icon = payload.icon
        deleted_existing.description = payload.description
        deleted_existing.deleted_at = None
        deleted_existing.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(deleted_existing)
        return CategoryResponse.from_orm_category(deleted_existing)

    cat = Category(
        user_id=uid,
        name=payload.name.strip(),
        slug=slug,
        color=payload.color,
        icon=payload.icon,
        description=payload.description,
        is_system=False,
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return CategoryResponse.from_orm_category(cat)


@router.put("/{category_id}", response_model=CategoryResponse)
async def update_category(
    category_id: str,
    payload: CategoryUpdate,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """Update an existing category owned by the authenticated user."""
    uid = parse_uuid(user_id, "user_id")
    cid = parse_uuid(category_id, "category_id")

    cat = (
        db.query(Category)
        .filter(Category.id == cid, Category.user_id == uid, Category.deleted_at.is_(None))
        .first()
    )
    if not cat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")

    if payload.name is not None:
        new_slug = _slugify(payload.name)
        conflict = (
            db.query(Category)
            .filter(
                Category.user_id == uid,
                Category.slug == new_slug,
                Category.id != cid,
                Category.deleted_at.is_(None),
            )
            .first()
        )
        if conflict:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Category '{payload.name}' already exists",
            )
        cat.name = payload.name.strip()
        cat.slug = new_slug
    if payload.color is not None:
        cat.color = payload.color
    if payload.icon is not None:
        cat.icon = payload.icon
    if payload.description is not None:
        cat.description = payload.description

    cat.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(cat)
    return CategoryResponse.from_orm_category(cat)


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(
    category_id: str,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """Soft-delete a custom category (default system categories cannot be deleted)."""
    uid = parse_uuid(user_id, "user_id")
    cid = parse_uuid(category_id, "category_id")

    cat = (
        db.query(Category)
        .filter(Category.id == cid, Category.user_id == uid, Category.deleted_at.is_(None))
        .first()
    )
    if not cat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    if cat.is_system:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Default system categories cannot be deleted",
        )

    cat.deleted_at = datetime.utcnow()
    db.commit()
    return None
