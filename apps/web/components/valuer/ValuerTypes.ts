export interface ChecklistItem {
  id: string
  label: string
  ok: boolean
  value: string
}

export interface ValuerAsset {
  ticker: string
  name: string
  asset_class: string
  sector: string
  best_pillar?: string | null
  fii_segment?: string | null
  vacancy_pct?: number | null
  price: number
  change_pct: number
  dpa_12m: number
  dy_12m: number
  pe_ratio?: number | null
  pvp_ratio?: number | null
  lpa: number
  vpa: number
  roe: number
  net_margin: number
  net_debt_ebitda: number
  payout_pct: number
  div_streak: number
  bazin_price?: number | null
  graham_price?: number | null
  gordon_price?: number | null
  consensus_price?: number | null
  margin_of_safety_pct: number
  bazin_mos_pct: number
  graham_mos_pct: number
  real_yield_spread_pct: number
  verdict: 'barato' | 'justo' | 'caro' | 'neutro'
  verdict_label: string
  score: number
  checklist: ChecklistItem[]
  checklist_passed: number
  checklist_total: number
  quote_source: string
  in_portfolio?: boolean
  trophies?: number
}

export interface WatchlistEntry {
  ticker: string
  name: string
  target_price: number
  notes?: string
  added_at: string
}

export function fmtBrl(v?: number | null): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

export function fmtPct(v?: number | null, signed = false): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  const prefix = signed && v > 0 ? '+' : ''
  return `${prefix}${v.toFixed(1).replace('.', ',')}%`
}

export function verdictBadgeClasses(verdict: ValuerAsset['verdict']): string {
  switch (verdict) {
    case 'barato':
      return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-400/35'
    case 'justo':
      return 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-400/35'
    case 'caro':
      return 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-400/35'
    default:
      return 'bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-400/30'
  }
}
