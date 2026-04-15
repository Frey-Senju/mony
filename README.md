# Mony

Money management application built with AIOX architecture.

## Architecture

```
mony/
├── apps/
│   ├── web/          # Next.js frontend (Vercel)
│   └── api/          # FastAPI backend (Render)
├── packages/         # Shared packages
├── docs/             # Documentation & stories
├── .aiox-core/       # AIOX framework
├── .claude/          # Claude Code config
└── .github/          # GitHub workflows
```

## CLI First Architecture

Priority: **CLI → Observability → UI**

All features work via CLI before any UI implementation.

## Getting Started

### Prerequisites
- Node.js 18+
- Python 3.11+
- PostgreSQL 15+

### Installation

```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env.local
# Edit .env.local with your configuration

# Initialize database
npm run db:init

# Start development
npm run dev
```

### Development

```bash
# Run all services in parallel
npm run dev

# Run specific app
cd apps/web && npm run dev
cd apps/api && python -m uvicorn main:app --reload

# Run tests
npm test

# Check types & lint
npm run typecheck
npm run lint
```

## Deployment

### Frontend (Vercel)
- Connected to `apps/web`
- Auto-deploys from `main` branch
- Environment: https://mony-web.vercel.app

### Backend (Render)
- Connected to `apps/api`
- Auto-deploys from `main` branch
- Environment: https://mony-api.onrender.com

## Development Workflow

1. **Story-Driven**: All work via AIOX stories
2. **Agent-Based**: Use @dev, @qa, @architect, @devops, etc.
3. **Quality First**: Tests & linting before commits
4. **CLI First**: Features work in CLI before UI

## Links

- **GitHub**: https://github.com/yourusername/mony
- **Vercel**: https://vercel.com/dashboard
- **Render**: https://dashboard.render.com
- **Documentation**: `./docs/`

---

**Built with Synkra AIOX** | CLI First | Observability Second | UI Third
