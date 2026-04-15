# EPIC-001: MVP Mony - Money Management Foundation

**Status**: Draft  
**Priority**: P0  
**Created**: 2026-04-15  
**Assigned**: @pm (Morgan)

## Overview

Build the foundational MVP for Mony - a money management application allowing users to track income and expenses.

## Objectives

1. **User Authentication** - Secure user registration and login
2. **Transaction Tracking** - Record income and expenses
3. **Dashboard** - View transaction history and balance
4. **Reports** - Basic financial reports and analytics

## Business Value

- Enable users to manage personal finances
- Foundation for future features (budgeting, investments, etc.)
- Minimal viable product to validate market fit

## Acceptance Criteria

- [ ] Users can register and login securely
- [ ] Users can create transactions (income/expense)
- [ ] Dashboard shows current balance and recent transactions
- [ ] Basic reports available (monthly summary, category breakdown)
- [ ] API and frontend fully functional
- [ ] Deployed to Vercel (frontend) and Render (backend)

## Technical Requirements

- **Frontend**: Next.js with TypeScript
- **Backend**: FastAPI with PostgreSQL
- **Authentication**: JWT tokens
- **Database**: PostgreSQL with Render
- **CI/CD**: GitHub Actions

## Stories

- [ ] Story 1.1: Database Schema Design
- [ ] Story 1.2: User Authentication (Backend)
- [ ] Story 1.3: User Authentication (Frontend)
- [ ] Story 1.4: Transaction API Endpoints
- [ ] Story 1.5: Dashboard UI
- [ ] Story 1.6: Reports Feature
- [ ] Story 1.7: Deployment Configuration

## Dependencies

None (greenfield project)

## Notes

- Keep MVP minimal and focused
- Prioritize user authentication first
- Use AIOX story-driven workflow
- CLI First architecture principle

---

**Next Step**: @sm creates Story 1.1 from this epic
