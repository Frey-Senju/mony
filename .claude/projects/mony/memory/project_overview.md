---
name: Mony Project Overview
description: MVP money management app built with AIOX architecture
type: project
---

# Mony - Money Management Application

**Status**: Just initialized  
**Architecture**: AIOX CLI-First  
**Created**: 2026-04-15

## Overview

Mony is a money management application enabling users to track income/expenses, view dashboards, and generate financial reports.

**Why**: Build foundational MVP to validate market fit for personal finance management tools.

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | Next.js 14 + TypeScript + React 18 |
| Backend | FastAPI + PostgreSQL |
| Hosting | Vercel (web) + Render (api) |
| Monorepo | Turbo + npm workspaces |
| CI/CD | GitHub Actions |

## MVP Scope (EPIC-001)

1. User authentication (JWT-based)
2. Transaction CRUD (income/expense)
3. Dashboard (balance + recent transactions)
4. Basic reports (monthly, category breakdown)
5. Fully deployed on Vercel + Render

**Target**: Minimal viable, market-fit validation

## How to Apply

- **Deployments**: Use Vercel for web, Render for API
- **Database**: PostgreSQL on Render (Story 1.1 designing schema now)
- **Stories**: All work through AIOX stories (@sm → @po → @dev → @qa → @devops)
- **CLI First**: Features work in API before frontend UI

## Team Agents

- @sm (River) - Creates stories from epics
- @po (Pax) - Validates stories
- @dev (Dex) - Implements features
- @qa (Quinn) - Tests and QA gates
- @devops (Gage) - Git push and deployments
- @architect (Aria) - System design (Story 1.1: DB schema)
- @data-engineer (Dara) - Database design (Story 1.1)

## Current State

- ✅ Project scaffolding complete (monorepo + apps)
- ✅ GitHub initialized with initial commit
- ⏳ Story 1.1: Database Schema Design (in progress)
- ⏳ Vercel + Render: Pending GitHub connection

## Key Files

- `docs/stories/EPIC-001.md` - Full MVP epic
- `docs/stories/active/1.1.story.md` - Current story (DB schema)
- `core-config.yaml` - Project configuration
- `docs/DEPLOYMENT.md` - Deployment guide

---

**Next Actions**:
1. @architect/@data-engineer: Design DB schema (Story 1.1)
2. Create GitHub repo and push
3. Connect Vercel + Render
4. Begin Story 1.2: Backend authentication
