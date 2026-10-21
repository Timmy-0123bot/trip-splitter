// 円換算・負担額・精算の計算（金額はすべて円単位の整数で扱う）

// レート文字列を数値にする。不正な値や 0 以下は null
export function parseRate(rate) {
  const value = Number(rate)
  return Number.isFinite(value) && value > 0 ? value : null
}

// 支払い1件を円に換算する。外貨はレートを掛けて1円単位に四捨五入。レート未設定なら null
export function toYen(payment, rate) {
  if (payment.currency === 'JPY') return Math.round(payment.amount)
  if (rate === null) return null
  return Math.round(payment.amount * rate)
}

// 円の金額を割る人で分ける。割り切れない端数は払った人から順に1円ずつ負担する
export function splitYen(yen, participantIds, payerId) {
  const ordered = participantIds.includes(payerId)
    ? [payerId, ...participantIds.filter((id) => id !== payerId)]
    : participantIds
  const base = Math.floor(yen / ordered.length)
  let rest = yen - base * ordered.length
  const shares = {}
  for (const id of ordered) {
    shares[id] = base + (rest > 0 ? 1 : 0)
    rest--
  }
  return shares
}

// 合計・メンバーごとの立替額と負担額・差額をまとめて計算する
export function summarize(members, payments, rate) {
  const paid = {}
  const owed = {}
  for (const m of members) {
    paid[m.id] = 0
    owed[m.id] = 0
  }

  let total = 0
  let unconvertedCount = 0
  for (const p of payments) {
    const yen = toYen(p, rate)
    if (yen === null) {
      unconvertedCount++
      continue
    }
    const participants = p.participantIds.filter((id) => id in owed)
    if (!(p.payerId in paid) || participants.length === 0) continue

    total += yen
    paid[p.payerId] += yen
    const shares = splitYen(yen, participants, p.payerId)
    for (const id of participants) owed[id] += shares[id]
  }

  // 差額がプラスの人は受け取る側、マイナスの人は払う側
  const balances = {}
  for (const m of members) balances[m.id] = paid[m.id] - owed[m.id]

  return { total, paid, owed, balances, unconvertedCount }
}

// 受け渡し回数が少なくなるよう、払う額の大きい人から受け取る額の大きい人へ順に割り当てる
export function settle(balances) {
  const debtors = []
  const creditors = []
  for (const [id, balance] of Object.entries(balances)) {
    if (balance < 0) debtors.push({ id, amount: -balance })
    else if (balance > 0) creditors.push({ id, amount: balance })
  }
  debtors.sort((a, b) => b.amount - a.amount)
  creditors.sort((a, b) => b.amount - a.amount)

  const transfers = []
  let i = 0
  let j = 0
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amount, creditors[j].amount)
    transfers.push({ from: debtors[i].id, to: creditors[j].id, amount })
    debtors[i].amount -= amount
    creditors[j].amount -= amount
    if (debtors[i].amount === 0) i++
    if (creditors[j].amount === 0) j++
  }
  return transfers
}

export function formatYen(yen) {
  return `${yen.toLocaleString('ja-JP')}円`
}

export function formatForeign(amount, code) {
  return `${amount.toLocaleString('ja-JP', { maximumFractionDigits: 2 })} ${code}`
}
