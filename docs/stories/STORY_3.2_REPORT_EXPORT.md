# Story 3.2 — Export CSV + Print PDF

**Epic:** EPIC-003 — Relatórios Avançados + Export
**Status:** Done
**Branch:** feature/3.1-custom-date-range

---

## Objetivo

Permitir exportação dos dados de relatório como CSV e impressão/PDF via browser.

---

## Acceptance Criteria

- [x] AC-1: Botão "Exportar CSV" gera arquivo com resumo + por categoria (BOM UTF-8)
- [x] AC-2: Botão "Imprimir / PDF" abre diálogo de impressão do browser
- [x] AC-3: `@media print` oculta nav e botões `.no-print`

---

## Mudanças

- `apps/web/utils/export.ts`: função `exportReportToCSV()` com seção Resumo e Por Categoria
- `apps/web/app/globals.css`: regras `@media print`
- `apps/web/app/dashboard/reports/page.tsx`: barra de ações com dois botões
