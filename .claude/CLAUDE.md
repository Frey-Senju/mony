# CLAUDE.md — Mony

## Constitution (NON-NEGOTIABLE)

| Artigo | Princípio | Severidade |
|--------|-----------|------------|
| I | CLI First | NON-NEGOTIABLE |
| II | Agent Authority | NON-NEGOTIABLE |
| III | Story-Driven Development | MUST |
| IV | No Invention | MUST |
| V | Quality First | MUST |
| VI | Absolute Imports | SHOULD |

Arquitetura: `CLI First → Observability Second → UI Third`

---

## Stack

| Camada | Tech | Versão | Host |
|--------|------|--------|------|
| Frontend | Next.js + React + TypeScript | 14 / 18 / 5.2 | Vercel |
| Backend | FastAPI + Pydantic v2 + SQLAlchemy | 0.104+ / 2.0+ / 2.0+ | Render |
| Database | PostgreSQL | 15+ | Render Postgres |
| Auth | JWT (15min access / 7d refresh) + bcrypt (cost 12) + TOTP | — | — |
| Testes E2E | Playwright | 1.59+ | — |
| Testes unitários | Jest / pytest | 29 / 7+ | — |
| Estado | Zustand | — | — |
| Charts | Recharts | 3.8+ | — |

URLs: Vercel `https://web-flame-alpha-37.vercel.app` | Render `https://api-mony.onrender.com`
GitHub: `https://github.com/Frey-Senju/mony`

---

## Estrutura

```
apps/web/          Next.js (Vercel)
apps/api/          FastAPI + Docker (Render)
packages/shared/   @mony/shared — Zod schemas + tipos comuns
docs/stories/      Stories ativas e concluídas
.claude/           Claude Code config
.github/           CI/CD workflows
```

---

## Convenções

**Nomenclatura:**
- Componentes React: `PascalCase` (arquivo + export)
- Hooks: prefixo `use` — `useTransactions`, `useReports`
- Arquivos: `kebab-case` — `monthly-summary-card.tsx`
- Constantes: `SCREAMING_SNAKE_CASE`
- DB columns: `snake_case`
- Enums: `SCREAMING_SNAKE_CASE`

**Imports — sempre absolutos:**
```typescript
// ✓ import { useAuth } from '@/stores/auth'
// ✗ import { useAuth } from '../../../stores/auth'
```

**TypeScript:**
- Sem `any` — use `unknown` com type guards
- Props sempre tipadas com interface explícita
- Refs explícitos: `useRef<HTMLDivElement>(null)`

**Python:**
- Pydantic v2 para todos os schemas de request/response
- SQLAlchemy 2.0 style (select() ao invés de query())
- UUID4 para IDs; `parse_uuid()` helper centralizado (pendente TD-3)

---

## Build & Dev Commands

```bash
# Frontend
cd apps/web
npm run dev          # Dev server :3000
npm run build        # Build produção
npm run lint         # ESLint
npm run typecheck    # TypeScript
npm test             # Jest unit
npm run test:e2e     # Playwright E2E (requer backend rodando)

# Backend
cd apps/api
uvicorn main:app --reload --port 8000   # Dev server
python run_test_server.py               # Servidor de testes isolado (SQLite)
python seed_test_data.py                # Popular dados de teste
pytest tests/ -v                        # Unit tests
pip install -r requirements.txt

# E2E completo
bash run_e2e_tests.sh                   # Orquestra backend + frontend + playwright

# Monorepo
npm run build        # Turbo build all
```

---

## Regra dos 95%

**Nenhuma alteração em código ou arquivos é executada sem 95% de confiança na solução.**

Se a confiança estiver abaixo desse limiar:
1. Fazer perguntas de acompanhamento críticas ao usuário
2. Ler arquivos relevantes adicionais
3. Documentar dúvidas na nota de sessão do Obsidian
4. Só executar após atingir o limiar

Esta regra vale para: código de produção, migrações de banco, configurações de CI/CD, mudanças de schema.

---

## Obsidian Brain

**Vault:** `C:\Users\cristofer.schwartzer\Desktop\Obsidian\Mony\`

Protocolo obrigatório:
- Toda sessão: criar nota `NN-SESSION-YYYYMMDD-DESCRICAO.md`
- Toda decisão técnica: registrar em `DECISIONS.md`
- Todo bloqueador: registrar com status e resolução
- Ao restaurar contexto: ler `INDEX.md` → nota de sessão mais recente → `DECISIONS.md`
- Links bidirecionais `[[nota_relacionada]]` em todas as notas

**Arquivos core do vault:**
- `INDEX.md` — hub central, sempre atualizado
- `SESSIONS.md` — log de sessões
- `DECISIONS.md` — DEC-001 a DEC-006+

---

## Agentes

| Agente | Função | Escopo Exclusivo |
|--------|--------|-----------------|
| `@dev` | Implementação | git add/commit |
| `@qa` | Testes e gates | QA verdicts |
| `@architect` | Design técnico | Decisões arquiteturais |
| `@pm` | Product + Epics | *execute-epic |
| `@po` | Stories/Backlog | *validate-story |
| `@sm` | Story creation | *draft |
| `@data-engineer` | Database/Schema | DDL, migrations |
| `@devops` | CI/CD | **git push (EXCLUSIVO)** |

---

*Mony — Synkra AIOX CLI First v4.0 | 200 linhas máx*
