# CLAUDE.md - Mony AIOX

Configuração Claude Code para projeto Mony.

---

## Constitution

Mony segue **Constitution formal do Synkra AIOX** com princípios inegociáveis.

**Princípios fundamentais:**

| Artigo | Princípio | Severidade |
|--------|-----------|------------|
| I | CLI First | NON-NEGOTIABLE |
| II | Agent Authority | NON-NEGOTIABLE |
| III | Story-Driven Development | MUST |
| IV | No Invention | MUST |
| V | Quality First | MUST |
| VI | Absolute Imports | SHOULD |

---

## Premissa Arquitetural: CLI First

```
CLI First → Observability Second → UI Third
```

---

## Sistema de Agentes

Ativação via `@agent-name`:

| Agente | Função |
|--------|--------|
| `@dev` | Implementação |
| `@qa` | Testes |
| `@architect` | Design técnico |
| `@pm` | Product |
| `@po` | Stories/Epics |
| `@sm` | Scrum Master |
| `@analyst` | Pesquisa |
| `@data-engineer` | Database |
| `@ux-design-expert` | UX/UI |
| `@devops` | CI/CD, Git Push |

---

## Estrutura

```
apps/web/          Next.js (Vercel)
apps/api/          FastAPI (Render)
packages/          Shared code
docs/stories/      Development stories
.claude/           Claude Config
.github/           Workflows
```

---

## Deployment

- **Web**: Vercel (auto-deploy main)
- **API**: Render (auto-deploy main)
- **DB**: PostgreSQL (Render Postgres)

---

*Synkra AIOX CLI First Architecture*
