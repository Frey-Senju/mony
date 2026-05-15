/**
 * Unit Tests — EPIC-002 Components
 *
 * Covers: BudgetCard, GoalCard, InsightCard, AnomalyAlert, TrendChart
 */

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { BudgetCard } from '@/components/budgets/BudgetCard'
import { GoalCard } from '@/components/goals/GoalCard'
import { InsightCard } from '@/components/insights/InsightCard'
import { AnomalyAlert } from '@/components/insights/AnomalyAlert'
import { TrendChart } from '@/components/insights/TrendChart'
import type { Budget } from '@/hooks/useBudgets'
import type { Goal } from '@/hooks/useGoals'
import type { Anomaly } from '@/lib/api/insights'

// Recharts ResizeObserver polyfill
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}))

// ============ Fixtures ============

const makeBudget = (overrides: Partial<Budget> = {}): Budget => ({
  id: 'budget-1',
  category: 'Alimentação',
  limit_amount: 500,
  currency: 'BRL',
  spent_amount: 250,
  percentage: 50,
  alert_level: 'ok',
  period: { month: 5, year: 2026 },
  created_at: '2026-05-01T00:00:00',
  updated_at: '2026-05-01T00:00:00',
  ...overrides,
})

const makeGoal = (overrides: Partial<Goal> = {}): Goal => ({
  id: 'goal-1',
  name: 'Reserva de emergência',
  description: null,
  target_amount: 10000,
  current_amount: 4000,
  currency: 'BRL',
  progress_pct: 40,
  remaining_amount: 6000,
  is_achieved: false,
  target_date: null,
  achieved_at: null,
  created_at: '2026-05-01T00:00:00',
  updated_at: '2026-05-01T00:00:00',
  ...overrides,
})

// ============ BudgetCard ============

describe('BudgetCard', () => {
  const noop = jest.fn()

  it('renders category name and amounts', () => {
    render(<BudgetCard budget={makeBudget()} onEdit={noop} onDelete={noop} />)
    expect(screen.getByText('Alimentação')).toBeInTheDocument()
    expect(screen.getByText(/R\$\s*250/)).toBeInTheDocument()
    expect(screen.getByText(/500/)).toBeInTheDocument()
  })

  it('shows "Dentro do limite" when alert_level is ok', () => {
    render(<BudgetCard budget={makeBudget({ alert_level: 'ok' })} onEdit={noop} onDelete={noop} />)
    expect(screen.getByText('Dentro do limite')).toBeInTheDocument()
  })

  it('shows "Próximo do limite" when alert_level is warning', () => {
    render(<BudgetCard budget={makeBudget({ alert_level: 'warning', percentage: 85 })} onEdit={noop} onDelete={noop} />)
    expect(screen.getByText('Próximo do limite')).toBeInTheDocument()
  })

  it('shows "Limite ultrapassado" when alert_level is exceeded', () => {
    render(<BudgetCard budget={makeBudget({ alert_level: 'exceeded', percentage: 110 })} onEdit={noop} onDelete={noop} />)
    expect(screen.getByText('Limite ultrapassado')).toBeInTheDocument()
  })

  it('calls onEdit when edit button is clicked', () => {
    const onEdit = jest.fn()
    render(<BudgetCard budget={makeBudget()} onEdit={onEdit} onDelete={noop} />)
    fireEvent.click(screen.getByRole('button', { name: /editar/i }))
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'budget-1' }))
  })

  it('calls onDelete when delete button is clicked', () => {
    const onDelete = jest.fn()
    render(<BudgetCard budget={makeBudget()} onEdit={noop} onDelete={onDelete} />)
    fireEvent.click(screen.getByRole('button', { name: /excluir/i }))
    expect(onDelete).toHaveBeenCalledWith('budget-1')
  })
})

// ============ GoalCard ============

describe('GoalCard', () => {
  const noop = jest.fn()

  it('renders goal name and progress', () => {
    render(<GoalCard goal={makeGoal()} onEdit={noop} onDeposit={noop} onDelete={noop} />)
    expect(screen.getByText('Reserva de emergência')).toBeInTheDocument()
    expect(screen.getByText(/40\.0%/)).toBeInTheDocument()
  })

  it('shows deposit button when goal is not achieved', () => {
    render(<GoalCard goal={makeGoal({ is_achieved: false })} onEdit={noop} onDeposit={noop} onDelete={noop} />)
    expect(screen.getByRole('button', { name: /depositar/i })).toBeInTheDocument()
  })

  it('hides deposit button when goal is achieved', () => {
    render(
      <GoalCard
        goal={makeGoal({ is_achieved: true, current_amount: 10000, progress_pct: 100, remaining_amount: 0 })}
        onEdit={noop}
        onDeposit={noop}
        onDelete={noop}
      />
    )
    expect(screen.queryByRole('button', { name: /depositar/i })).not.toBeInTheDocument()
  })

  it('shows "Meta atingida!" when achieved', () => {
    render(
      <GoalCard
        goal={makeGoal({ is_achieved: true, current_amount: 10000, progress_pct: 100, remaining_amount: 0 })}
        onEdit={noop}
        onDeposit={noop}
        onDelete={noop}
      />
    )
    expect(screen.getByText('Meta atingida!')).toBeInTheDocument()
  })

  it('calls onDeposit when deposit button is clicked', () => {
    const onDeposit = jest.fn()
    render(<GoalCard goal={makeGoal()} onEdit={noop} onDeposit={onDeposit} onDelete={noop} />)
    fireEvent.click(screen.getByRole('button', { name: /depositar/i }))
    expect(onDeposit).toHaveBeenCalledWith(expect.objectContaining({ id: 'goal-1' }))
  })

  it('renders target_date when provided', () => {
    render(
      <GoalCard
        goal={makeGoal({ target_date: '2026-12-31' })}
        onEdit={noop}
        onDeposit={noop}
        onDelete={noop}
      />
    )
    expect(screen.getByText(/Prazo:/)).toBeInTheDocument()
  })
})

// ============ InsightCard ============

describe('InsightCard', () => {
  it('renders title and children', () => {
    render(
      <InsightCard title="Top Categorias" icon={<span>★</span>} color="purple">
        <p>conteúdo</p>
      </InsightCard>
    )
    expect(screen.getByText('Top Categorias')).toBeInTheDocument()
    expect(screen.getByText('conteúdo')).toBeInTheDocument()
  })

  it('shows loading skeleton when loading=true', () => {
    const { container } = render(
      <InsightCard title="Tendência" icon={<span>↑</span>} color="blue" loading>
        <p>não renderizado</p>
      </InsightCard>
    )
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
    expect(screen.queryByText('não renderizado')).not.toBeInTheDocument()
  })
})

// ============ AnomalyAlert ============

describe('AnomalyAlert', () => {
  it('shows empty state when no anomalies', () => {
    render(<AnomalyAlert anomalies={[]} />)
    expect(screen.getByText(/Nenhuma anomalia detectada/i)).toBeInTheDocument()
  })

  it('renders anomaly items', () => {
    const anomalies: Anomaly[] = [
      { category: 'Lazer', current_month: 800, avg_3m: 200, ratio: 4.0 },
      { category: 'Saúde', current_month: 600, avg_3m: 150, ratio: 4.0 },
    ]
    render(<AnomalyAlert anomalies={anomalies} />)
    expect(screen.getByText('Lazer')).toBeInTheDocument()
    expect(screen.getByText('Saúde')).toBeInTheDocument()
    expect(screen.getAllByText(/4\.0×/)).toHaveLength(2)
  })
})

// ============ TrendChart ============

describe('TrendChart', () => {
  it('shows empty state when data is empty', () => {
    render(<TrendChart data={[]} />)
    expect(screen.getByText(/Dados insuficientes/i)).toBeInTheDocument()
  })

  it('does not show empty state when data is provided', () => {
    const data = [
      { label: 'Jan/26', expenses: 1000 },
      { label: 'Fev/26', expenses: 1200 },
    ]
    render(<TrendChart data={data} />)
    expect(screen.queryByText(/Dados insuficientes/i)).not.toBeInTheDocument()
  })
})
