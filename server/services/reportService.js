async function getMonthlyReport(db, year) {
  return await db.all(`
    SELECT
      period_key,
      COUNT(*) as bill_count,
      SUM(usage) as total_volume,
      SUM(total) as total_billed,
      SUM(CASE WHEN status='paid' THEN total ELSE 0 END) as total_paid,
      SUM(CASE WHEN status!='paid' THEN total ELSE 0 END) as total_unpaid,
      SUM(CASE WHEN status='paid' THEN total ELSE 0 END) * 100.0 / SUM(total) as pay_rate
    FROM bills
    WHERE period_key LIKE ?
    GROUP BY period_key
    ORDER BY period_key
  `, [`${year}-%`])
}

async function getSummaryReport(db, today) {
  return await db.get(`
    SELECT
      COUNT(DISTINCT cust_id) as active_customers,
      SUM(usage) as total_volume,
      SUM(total) as total_billed,
      SUM(CASE WHEN status='paid' THEN total ELSE 0 END) as total_paid,
      SUM(CASE WHEN status!='paid' THEN total ELSE 0 END) as unpaid_amount,
      SUM(CASE WHEN status='overdue' OR (status='unpaid' AND due_date < ?) THEN total ELSE 0 END) as overdue_amount,
      COUNT(CASE WHEN status!='paid' THEN 1 END) as unpaid_count
    FROM bills
  `, [today])
}

async function getCustomerReport(db, year) {
  return await db.all(`
    SELECT
      c.id, c.name as cust_name, c.meter, c.grp,
      COUNT(b.id)                                                      as bill_count,
      SUM(b.usage)                                                     as total_volume,
      SUM(b.total)                                                     as total_billed,
      SUM(CASE WHEN b.status='paid' THEN b.total ELSE 0 END)          as total_paid
    FROM customers c
    JOIN bills b ON b.cust_id = c.id
    WHERE b.period_key LIKE ?
    GROUP BY c.id, c.name, c.meter, c.grp
    ORDER BY total_billed DESC
  `, [`${year}-%`])
}

module.exports = {
  getMonthlyReport,
  getSummaryReport,
  getCustomerReport,
}
