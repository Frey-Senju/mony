'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  GraduationCap,
  CheckCircle2,
  Circle,
  BookOpen,
  ArrowRight,
  Search,
} from 'lucide-react'

const PROGRESS_KEY = 'mony_academy_completed_v1'

interface Lesson {
  id: string
  title: string
  formula?: string
  summary: string
  example: string
  actionLabel: string
  actionTarget: { type: 'tab'; tab: 'radar' | 'matamata' | 'markets'; preset?: string } | { type: 'route'; href: string }
}

interface Track {
  id: string
  emoji: string
  title: string
  subtitle: string
  lessons: Lesson[]
}

const TRACKS: Track[] = [
  {
    id: 'acoes',
    emoji: '📈',
    title: 'Mapa das Ações & Valuation',
    subtitle: 'Domine Bazin, Graham, Gordon e nunca mais pague caro em uma empresa',
    lessons: [
      {
        id: 'bazin',
        title: 'Preço Teto de Décio Bazin',
        formula: 'Preço Teto = DPA 12m ÷ DY Mínimo (ex.: 6%)',
        summary: 'Garante um retorno mínimo em dividendos já na compra. Se a ação paga R$ 3,00/ano e você exige 6%, o teto é R$ 50,00.',
        example: 'BBAS3 pagando R$ 2,85/ano com DY alvo 6% → Preço Teto de R$ 47,50 (ampla margem de segurança).',
        actionLabel: 'Abrir Radar de Dividendos',
        actionTarget: { type: 'tab', tab: 'radar', preset: 'dividendos' },
      },
      {
        id: 'graham',
        title: 'Valor Intrínseco de Benjamin Graham',
        formula: 'VI = √(22,5 × LPA × VPA)',
        summary: 'Combina lucro (P/L ≤ 15) e patrimônio (P/VP ≤ 1,5) em uma única fórmula conservadora para filtrar empresas baratas.',
        example: 'Ação com LPA R$ 6,45 e VPA R$ 31,80 → VI = √(22,5 × 6,45 × 31,80) = R$ 67,93.',
        actionLabel: 'Abrir Radar de Barganha',
        actionTarget: { type: 'tab', tab: 'radar', preset: 'barganha' },
      },
      {
        id: 'best',
        title: 'Estratégia Previdenciária B.E.S.T.',
        formula: 'Bancos · Energia · Saneamento · Seguros · Telecom',
        summary: 'Setores perenes de demanda inelástica, receitas previsíveis e distribuição consistente de proventos ao longo de décadas.',
        example: 'Carteira previdenciária focada em TAEE11, BBAS3, BBSE3, SAPR11 e VIVT3.',
        actionLabel: 'Abrir Radar Previdenciário',
        actionTarget: { type: 'tab', tab: 'radar', preset: 'previdenciario' },
      },
    ],
  },
  {
    id: 'fiis',
    emoji: '🏢',
    title: 'Mapa dos Fundos Imobiliários (FIIs)',
    subtitle: 'Renda mensal isenta de IR analisando P/VP, Vacância e Spread sobre IPCA+',
    lessons: [
      {
        id: 'fii_pvp',
        title: 'P/VP e Desconto Patrimonial',
        formula: 'P/VP = Preço da Cota ÷ Valor Patrimonial (VPA)',
        summary: 'P/VP abaixo de 1,00 indica que você compra os imóveis ou CRIs com desconto. Sempre cruze com vacância e qualidade dos imóveis.',
        example: 'FII de logística com VPA R$ 110 negociado a R$ 96 → P/VP 0,87 (13% de desconto patrimonial).',
        actionLabel: 'Abrir Radar de FIIs',
        actionTarget: { type: 'tab', tab: 'radar', preset: 'fiis' },
      },
      {
        id: 'fii_spread',
        title: 'Spread sobre NTN-B (Tesouro IPCA+)',
        formula: 'Yield Real = ((1 + DY) ÷ (1 + IPCA)) − 1',
        summary: 'Um bom FII de tijolo ou papel deve entregar prêmio real acima do Tesouro IPCA+ longo para compensar o risco de renda variável.',
        example: 'DY 11% com IPCA 4,5% → Yield real líquido de ~6,2% a.a. (isento de IR na PF).',
        actionLabel: 'Ver Termômetro Macro',
        actionTarget: { type: 'tab', tab: 'markets' },
      },
    ],
  },
  {
    id: 'rendafixa',
    emoji: '🏦',
    title: 'Mapa da Renda Fixa & Juros Reais',
    subtitle: 'CDI, IPCA+, IR regressivo e o poder dos juros compostos',
    lessons: [
      {
        id: 'rf_cdi_lci',
        title: 'CDB vs LCI/LCA (Equivalência de IR)',
        formula: 'LCI equivalente = CDB × (1 − alíquota IR)',
        summary: 'Acima de 720 dias o IR cai para 15%. Uma LCI pagando 92% do CDI equivale a um CDB pagando ~108,2% do CDI.',
        example: 'Use o comparador de Renda Fixa ou À Vista vs Parcelado no CDI nos Simuladores.',
        actionLabel: 'Abrir Simuladores Financeiros',
        actionTarget: { type: 'route', href: '/dashboard/simulators' },
      },
      {
        id: 'rf_fire',
        title: 'Regra dos 4% & Independência Financeira (FIRE)',
        formula: 'Patrimônio FIRE = Gasto Anual ÷ Taxa de Retirada',
        summary: 'Com juro real brasileiro de 5%–6% a.a., uma retirada segura de 4%–5% ao ano permite viver de renda preservando poder de compra.',
        example: 'Custo de vida R$ 6.000/mês (R$ 72k/ano) a 5% real → Patrimônio alvo de R$ 1,44 milhão.',
        actionLabel: 'Simular meu FIRE',
        actionTarget: { type: 'route', href: '/dashboard/simulators' },
      },
    ],
  },
  {
    id: 'carteira',
    emoji: '⚖️',
    title: 'Mapa da Carteira & Rebalanceamento',
    subtitle: 'Aporte inteligente sem girar patrimônio nem pagar imposto desnecessário',
    lessons: [
      {
        id: 'rebalance_rule',
        title: 'Rebalancear pelos Novos Aportes (Modo Valuer)',
        formula: 'Prioridade = Classe Abaixo da Meta + Maior Margem de Segurança',
        summary: 'Em vez de vender quem subiu (gerando IR), direcione o dinheiro novo do mês para a classe atrasada comprando os ativos abaixo do Preço Teto.',
        example: 'Use o Mata-Mata para desempatar dois ativos da mesma classe antes do aporte mensal.',
        actionLabel: 'Abrir Mata-Mata de Ativos',
        actionTarget: { type: 'tab', tab: 'matamata' },
      },
      {
        id: 'tech_timing',
        title: 'Timing com Médias Móveis e RSI(14)',
        formula: 'RSI < 30 (Sobrevendido) · Preço próximo ao Suporte',
        summary: 'Fundamentalismo diz O QUE comprar; Análise Técnica simples (MM20/50 e RSI 14) ajuda a evitar comprar no pico de euforia.',
        example: 'Clique em qualquer ticker no Radar para abrir o gráfico com MM20, MM50, Suporte e RSI(14).',
        actionLabel: 'Ir para Rebalanceamento',
        actionTarget: { type: 'route', href: '/dashboard/investments' },
      },
    ],
  },
]

const GLOSSARY = [
  { term: 'DY (Dividend Yield)', desc: 'Proventos pagos nos últimos 12 meses divididos pela cotação atual do ativo.' },
  { term: 'P/L', desc: 'Preço sobre Lucro — quantos anos de lucro atual seriam necessários para pagar a ação.' },
  { term: 'P/VP', desc: 'Preço sobre Valor Patrimonial — abaixo de 1,0 indica negociação abaixo do valor contábil.' },
  { term: 'ROE', desc: 'Retorno sobre o Patrimônio Líquido — eficiência da empresa em gerar lucro com capital próprio.' },
  { term: 'Margem de Segurança', desc: 'Desconto percentual entre a cotação atual e o preço justo/teto calculado.' },
  { term: 'RSI (14)', desc: 'Índice de Força Relativa (0–100): abaixo de 30 indica sobrevenda; acima de 70, sobrecompra.' },
  { term: 'Dív. Líq / EBITDA', desc: 'Alavancagem financeira — quantos anos de geração de caixa operacional quitam a dívida líquida.' },
  { term: 'Yield on Cost (YoC)', desc: 'Dividendos anuais divididos pelo seu preço médio de compra (cresce com o tempo).' },
]

export function MonyAcademyPanel({
  onJumpTab,
}: {
  onJumpTab: (tab: 'radar' | 'matamata' | 'markets', preset?: string) => void
}) {
  const router = useRouter()
  const [completed, setCompleted] = useState<string[]>([])
  const [glossSearch, setGlossSearch] = useState('')

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PROGRESS_KEY)
      if (saved) setCompleted(JSON.parse(saved))
    } catch {
      // ignore
    }
  }, [])

  const toggleLesson = (id: string) => {
    setCompleted((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      try {
        localStorage.setItem(PROGRESS_KEY, JSON.stringify(next))
      } catch {
        // ignore
      }
      return next
    })
  }

  const totalLessons = TRACKS.reduce((s, t) => s + t.lessons.length, 0)
  const pct = totalLessons > 0 ? Math.round((completed.length / totalLessons) * 100) : 0

  const filteredGlossary = glossSearch.trim()
    ? GLOSSARY.filter(
        (g) =>
          g.term.toLowerCase().includes(glossSearch.toLowerCase()) ||
          g.desc.toLowerCase().includes(glossSearch.toLowerCase())
      )
    : GLOSSARY

  return (
    <div className="space-y-6">
      {/* Progress Header */}
      <div className="glass-panel p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shadow-sm shrink-0"
            style={{ background: 'var(--accent)' }}
          >
            <GraduationCap className="w-5 h-5" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Mony Academy · Trilhas Práticas de Valuation
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Aprenda as metodologias de Bazin, Graham, FIIs e Renda Fixa aplicadas direto às ferramentas do Mony
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 min-w-[200px]">
          <div className="flex-1 h-2.5 rounded-full bg-slate-200/80 dark:bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, background: 'var(--accent)' }}
            />
          </div>
          <span className="text-xs font-extrabold text-slate-800 dark:text-white tabular-nums">
            {completed.length}/{totalLessons} ({pct}%)
          </span>
        </div>
      </div>

      {/* 4 Tracks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {TRACKS.map((track) => (
          <section key={track.id} className="glass-panel p-5 space-y-4">
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <span>{track.emoji}</span>
                {track.title}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{track.subtitle}</p>
            </div>

            <div className="space-y-3">
              {track.lessons.map((lesson) => {
                const done = completed.includes(lesson.id)
                return (
                  <div
                    key={lesson.id}
                    className={`glass-card p-4 space-y-2 transition ${
                      done ? 'border-emerald-400/40 bg-emerald-500/5' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => toggleLesson(lesson.id)}
                        className="flex items-center gap-2 text-left group"
                      >
                        {done ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        ) : (
                          <Circle className="w-4 h-4 text-slate-400 group-hover:text-blue-500 shrink-0" />
                        )}
                        <span
                          className={`text-sm font-bold ${
                            done
                              ? 'text-emerald-700 dark:text-emerald-300'
                              : 'text-slate-900 dark:text-white'
                          }`}
                        >
                          {lesson.title}
                        </span>
                      </button>
                    </div>

                    {lesson.formula && (
                      <div className="px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-700 dark:text-blue-300 text-[11px] font-mono font-semibold inline-block">
                        {lesson.formula}
                      </div>
                    )}

                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {lesson.summary}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 italic">
                      Exemplo: {lesson.example}
                    </p>

                    <div className="pt-1 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => toggleLesson(lesson.id)}
                        className="text-[11px] font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white"
                      >
                        {done ? 'Marcar como pendente' : 'Marcar como concluída'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (lesson.actionTarget.type === 'tab') {
                            onJumpTab(lesson.actionTarget.tab, lesson.actionTarget.preset)
                          } else {
                            router.push(lesson.actionTarget.href)
                          }
                        }}
                        className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                      >
                        {lesson.actionLabel}
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>

      {/* Quick Searchable Glossary */}
      <section className="glass-panel p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-blue-500" />
            Glossário Rápido Fundamentalista &amp; Técnico
          </h3>
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={glossSearch}
              onChange={(e) => setGlossSearch(e.target.value)}
              placeholder="Buscar termo (ex: P/VP, RSI...)"
              className="liquid-input w-full pl-8 py-1.5 text-xs"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {filteredGlossary.map((g) => (
            <div key={g.term} className="glass-card p-3.5 space-y-1">
              <p className="text-xs font-extrabold text-blue-700 dark:text-blue-300">{g.term}</p>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">{g.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
