# MCP Usage Rules - Mony Project

## Tool Selection Priority

**ALWAYS prefer native Claude Code tools over MCP:**

| Tarefa | Use | NOT |
|--------|-----|-----|
| Ler arquivos | `Read` | docker-gateway |
| Editar arquivos | `Edit` / `Write` | docker-gateway |
| Rodar comandos | `Bash` | docker-gateway |
| Buscar arquivos | `Glob` | docker-gateway |
| Buscar conteúdo | `Grep` | docker-gateway |

## MCP Governance

**EXCLUSIVE @devops:**
- Add/remove MCP servers
- Configure Docker MCP
- Manage CI/CD secrets

---

*Synkra AIOX MCP Rules*
