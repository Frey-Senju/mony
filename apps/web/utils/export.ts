/**
 * Export utilities for transactions and reports
 */

interface Transaction {
  id: string
  description: string
  amount: number
  type: 'income' | 'expense'
  transaction_date: string
  merchant_name?: string
  is_reconciled: boolean
  currency: string
  notes?: string
}

/**
 * Export transactions to CSV format
 */
export function exportToCSV(transactions: Transaction[], filename: string = 'transactions.csv') {
  const headers = [
    'ID',
    'Data',
    'Descrição',
    'Comerciante',
    'Tipo',
    'Valor',
    'Moeda',
    'Reconciliado',
    'Notas',
  ]

  const rows = transactions.map((tx) => [
    tx.id,
    new Date(tx.transaction_date).toLocaleDateString('pt-BR'),
    tx.description,
    tx.merchant_name || '',
    tx.type === 'income' ? 'Receita' : 'Despesa',
    tx.amount.toFixed(2).replace('.', ','),
    tx.currency,
    tx.is_reconciled ? 'Sim' : 'Não',
    (tx.notes || '').replace(/"/g, '""'), // Escape quotes
  ])

  const csvContent = [
    headers.map((h) => `"${h}"`).join(','),
    ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
  ].join('\n')

  // Add BOM for Excel UTF-8 support
  const bom = '\uFEFF'
  const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' })

  downloadFile(blob, filename)
}

/**
 * Export transactions to JSON format
 */
export function exportToJSON(
  transactions: Transaction[],
  filename: string = 'transactions.json'
) {
  const jsonData = {
    exportDate: new Date().toISOString(),
    transactionCount: transactions.length,
    transactions: transactions.map((tx) => ({
      ...tx,
      transaction_date: new Date(tx.transaction_date).toLocaleDateString('pt-BR'),
    })),
  }

  const blob = new Blob([JSON.stringify(jsonData, null, 2)], {
    type: 'application/json;charset=utf-8;',
  })

  downloadFile(blob, filename)
}

/**
 * Generate simple HTML report
 */
export function exportToHTML(transactions: Transaction[], filename: string = 'report.html') {
  const totalIncome = transactions
    .filter((tx) => tx.type === 'income')
    .reduce((sum, tx) => sum + tx.amount, 0)

  const totalExpense = transactions
    .filter((tx) => tx.type === 'expense')
    .reduce((sum, tx) => sum + tx.amount, 0)

  const balance = totalIncome - totalExpense

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Relatório de Transações - Mony</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
    .container { max-width: 1000px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; }
    h1 { color: #333; border-bottom: 2px solid #3B82F6; padding-bottom: 10px; }
    .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin: 20px 0; }
    .summary-card { padding: 15px; border-radius: 8px; text-align: center; }
    .income { background: #10B98130; color: #059669; }
    .expense { background: #EF444430; color: #DC2626; }
    .balance { background: #3B82F630; color: #1e40af; }
    .summary-card strong { display: block; font-size: 20px; margin: 10px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th { background: #f3f4f6; padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb; }
    td { padding: 12px; border-bottom: 1px solid #e5e7eb; }
    tr:hover { background: #f9fafb; }
    .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Relatório de Transações</h1>
    <p>Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}</p>

    <div class="summary">
      <div class="summary-card income">
        <div>Total de Receitas</div>
        <strong>R$ ${totalIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
      </div>
      <div class="summary-card expense">
        <div>Total de Despesas</div>
        <strong>R$ ${totalExpense.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
      </div>
      <div class="summary-card balance">
        <div>Saldo</div>
        <strong>R$ ${balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Data</th>
          <th>Descrição</th>
          <th>Comerciante</th>
          <th>Tipo</th>
          <th>Valor</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${transactions
          .map(
            (tx) => `
          <tr>
            <td>${new Date(tx.transaction_date).toLocaleDateString('pt-BR')}</td>
            <td>${tx.description}</td>
            <td>${tx.merchant_name || '-'}</td>
            <td>${tx.type === 'income' ? 'Receita' : 'Despesa'}</td>
            <td style="text-align: right; color: ${tx.type === 'income' ? '#059669' : '#DC2626'}">
              ${tx.type === 'income' ? '+' : '-'} R$ ${tx.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </td>
            <td>${tx.is_reconciled ? '✓ Reconciliado' : '⚠ Pendente'}</td>
          </tr>
        `
          )
          .join('')}
      </tbody>
    </table>

    <div class="footer">
      <p><strong>Mony Financial Dashboard</strong></p>
      <p>Este relatório foi gerado automaticamente e contém ${transactions.length} transações.</p>
    </div>
  </div>
</body>
</html>
  `

  const blob = new Blob([html], { type: 'text/html;charset=utf-8;' })
  downloadFile(blob, filename)
}

/**
 * Helper function to download file
 */
function downloadFile(blob: Blob, filename: string) {
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)

  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  link.style.visibility = 'hidden'

  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  // Clean up
  URL.revokeObjectURL(url)
}

/**
 * Export summary report
 */
export function generateSummaryReport(transactions: Transaction[]) {
  const totalIncome = transactions
    .filter((tx) => tx.type === 'income')
    .reduce((sum, tx) => sum + tx.amount, 0)

  const totalExpense = transactions
    .filter((tx) => tx.type === 'expense')
    .reduce((sum, tx) => sum + tx.amount, 0)

  const balance = totalIncome - totalExpense

  const monthlyData: { [key: string]: { income: number; expense: number } } = {}

  transactions.forEach((tx) => {
    const date = new Date(tx.transaction_date)
    const month = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

    if (!monthlyData[month]) {
      monthlyData[month] = { income: 0, expense: 0 }
    }

    if (tx.type === 'income') {
      monthlyData[month].income += tx.amount
    } else {
      monthlyData[month].expense += tx.amount
    }
  })

  return {
    totalTransactions: transactions.length,
    totalIncome,
    totalExpense,
    balance,
    reconciled: transactions.filter((tx) => tx.is_reconciled).length,
    pending: transactions.filter((tx) => !tx.is_reconciled).length,
    monthlyBreakdown: monthlyData,
  }
}
