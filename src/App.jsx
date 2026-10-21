import { useEffect, useMemo, useState } from 'react'
import { createId, loadData, saveData } from './storage.js'
import {
  formatForeign,
  formatYen,
  parseRate,
  settle,
  summarize,
  toYen,
} from './settlement.js'

export default function App() {
  const [data, setData] = useState(loadData)
  const { members, foreign, payments } = data
  const rate = parseRate(foreign.rate)

  // 変更があるたびにローカルストレージへ保存する
  useEffect(() => {
    saveData(data)
  }, [data])

  const summary = useMemo(
    () => summarize(members, payments, rate),
    [members, payments, rate],
  )
  const transfers = useMemo(() => settle(summary.balances), [summary])

  const nameOf = (id) => members.find((m) => m.id === id)?.name ?? '（不明）'

  const addMember = (name) => {
    setData((d) => ({ ...d, members: [...d.members, { id: createId(), name }] }))
  }
  const removeMember = (id) => {
    setData((d) => ({ ...d, members: d.members.filter((m) => m.id !== id) }))
  }
  const updateForeign = (patch) => {
    setData((d) => ({ ...d, foreign: { ...d.foreign, ...patch } }))
  }
  const addPayment = (payment) => {
    setData((d) => ({ ...d, payments: [{ id: createId(), ...payment }, ...d.payments] }))
  }
  const removePayment = (id) => {
    setData((d) => ({ ...d, payments: d.payments.filter((p) => p.id !== id) }))
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>旅の割り勘</h1>
        <p>立て替えを記録して、最後にまとめて精算</p>
      </header>

      <MemberSection
        members={members}
        payments={payments}
        onAdd={addMember}
        onRemove={removeMember}
      />
      <ForeignSection foreign={foreign} onChange={updateForeign} />
      <PaymentForm members={members} foreign={foreign} rate={rate} onAdd={addPayment} />
      <PaymentList
        payments={payments}
        members={members}
        foreign={foreign}
        rate={rate}
        nameOf={nameOf}
        onRemove={removePayment}
      />
      <SummarySection
        summary={summary}
        members={members}
        foreignCode={foreign.code}
      />
      <SettlementSection transfers={transfers} nameOf={nameOf} hasPayments={summary.total > 0} />
    </div>
  )
}

function MemberSection({ members, payments, onAdd, onRemove }) {
  const [name, setName] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onAdd(trimmed)
    setName('')
  }

  // 支払いに登場するメンバーを消すと計算が合わなくなるため削除させない
  const isUsed = (id) =>
    payments.some((p) => p.payerId === id || p.participantIds.includes(id))

  return (
    <section className="card">
      <h2>メンバー</h2>
      {members.length > 0 && (
        <ul className="chips">
          {members.map((m) => (
            <li key={m.id} className="chip">
              <span>{m.name}</span>
              <button
                type="button"
                className="chip-remove"
                onClick={() => onRemove(m.id)}
                disabled={isUsed(m.id)}
                aria-label={`${m.name}を削除`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="row" onSubmit={handleSubmit}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="名前を入力"
          aria-label="メンバー名"
        />
        <button type="submit" className="btn" disabled={!name.trim()}>
          追加
        </button>
      </form>
      {members.some((m) => isUsed(m.id)) && (
        <p className="hint">支払いに含まれているメンバーは削除できません</p>
      )}
    </section>
  )
}

function ForeignSection({ foreign, onChange }) {
  return (
    <section className="card">
      <h2>外貨のレート</h2>
      <div className="rate-row">
        <span>1</span>
        <input
          type="text"
          className="code-input"
          value={foreign.code}
          onChange={(e) => onChange({ code: e.target.value.toUpperCase() })}
          maxLength={5}
          aria-label="通貨コード"
        />
        <span>＝</span>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          value={foreign.rate}
          onChange={(e) => onChange({ rate: e.target.value })}
          placeholder="150"
          aria-label="レート（円）"
        />
        <span>円</span>
      </div>
      <p className="hint">レートを変えると、これまでの外貨の支払いもすべて計算し直されます</p>
    </section>
  )
}

function PaymentForm({ members, foreign, rate, onAdd }) {
  const [payerId, setPayerId] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('JPY')
  const [title, setTitle] = useState('')
  // 「外した人」を持つことで、あとから追加したメンバーも初期状態で全員にチェックが入る
  const [excludedIds, setExcludedIds] = useState([])

  if (members.length === 0) {
    return (
      <section className="card">
        <h2>支払いを記録</h2>
        <p className="hint">先にメンバーを追加してください</p>
      </section>
    )
  }

  const effectivePayerId = members.some((m) => m.id === payerId) ? payerId : members[0].id
  const participantIds = members.filter((m) => !excludedIds.includes(m.id)).map((m) => m.id)
  const amountValue = Number(amount)
  const isAmountValid = Number.isFinite(amountValue) && amountValue > 0
  const canSubmit = isAmountValid && title.trim() && participantIds.length > 0
  const code = foreign.code || '外貨'

  const toggleParticipant = (id) => {
    setExcludedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!canSubmit) return
    onAdd({
      payerId: effectivePayerId,
      amount: amountValue,
      currency,
      title: title.trim(),
      participantIds,
      createdAt: Date.now(),
    })
    // 払った人と通貨は続けて入力することが多いので残す
    setAmount('')
    setTitle('')
    setExcludedIds([])
  }

  return (
    <section className="card">
      <h2>支払いを記録</h2>
      <form className="form" onSubmit={handleSubmit}>
        <label className="field">
          <span className="label">払った人</span>
          <select value={effectivePayerId} onChange={(e) => setPayerId(e.target.value)}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>

        <div className="field">
          <span className="label">金額</span>
          <div className="row">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              aria-label="金額"
            />
            <div className="segmented" role="group" aria-label="通貨">
              <button
                type="button"
                className={currency === 'JPY' ? 'active' : ''}
                onClick={() => setCurrency('JPY')}
              >
                円
              </button>
              <button
                type="button"
                className={currency === 'FOREIGN' ? 'active' : ''}
                onClick={() => setCurrency('FOREIGN')}
              >
                {code}
              </button>
            </div>
          </div>
          {currency === 'FOREIGN' && isAmountValid && (
            <p className="hint">
              {rate === null
                ? 'レートが未入力のため、円に換算できません'
                : `約 ${formatYen(Math.round(amountValue * rate))}`}
            </p>
          )}
        </div>

        <label className="field">
          <span className="label">内容</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例：タクシー"
          />
        </label>

        <fieldset className="field">
          <legend className="label">割る人</legend>
          <div className="checks">
            {members.map((m) => (
              <label key={m.id} className="check">
                <input
                  type="checkbox"
                  checked={!excludedIds.includes(m.id)}
                  onChange={() => toggleParticipant(m.id)}
                />
                <span>{m.name}</span>
              </label>
            ))}
          </div>
          {participantIds.length === 0 && <p className="hint error">1人以上選んでください</p>}
        </fieldset>

        <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
          記録する
        </button>
      </form>
    </section>
  )
}

function PaymentList({ payments, members, foreign, rate, nameOf, onRemove }) {
  const handleRemove = (p) => {
    if (window.confirm(`「${p.title}」を削除しますか？`)) onRemove(p.id)
  }

  return (
    <section className="card">
      <h2>支払い一覧（{payments.length}件）</h2>
      {payments.length === 0 ? (
        <p className="hint">まだ記録がありません</p>
      ) : (
        <ul className="payments">
          {payments.map((p) => {
            const yen = toYen(p, rate)
            const isAll =
              p.participantIds.length === members.length &&
              members.every((m) => p.participantIds.includes(m.id))
            return (
              <li key={p.id} className="payment">
                <div className="payment-main">
                  <div className="payment-title">{p.title}</div>
                  <div className="payment-meta">
                    {nameOf(p.payerId)}が支払い・
                    {isAll ? '全員' : p.participantIds.map(nameOf).join('、')}で割る
                  </div>
                </div>
                <div className="payment-amount">
                  {p.currency === 'JPY' ? (
                    <strong>{formatYen(yen)}</strong>
                  ) : (
                    <>
                      <strong>{yen === null ? '換算不可' : formatYen(yen)}</strong>
                      <span className="sub">{formatForeign(p.amount, foreign.code || '外貨')}</span>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => handleRemove(p)}
                  aria-label={`${p.title}を削除`}
                >
                  ×
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function SummarySection({ summary, members, foreignCode }) {
  return (
    <section className="card">
      <h2>合計（円換算）</h2>
      <div className="total">{formatYen(summary.total)}</div>
      {summary.unconvertedCount > 0 && (
        <p className="hint error">
          {foreignCode || '外貨'}の支払いが{summary.unconvertedCount}
          件あります。レートを入力すると合計に含まれます
        </p>
      )}
      {members.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>名前</th>
              <th>立て替えた額</th>
              <th>負担額</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td>{m.name}</td>
                <td>{formatYen(summary.paid[m.id])}</td>
                <td>{formatYen(summary.owed[m.id])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

function SettlementSection({ transfers, nameOf, hasPayments }) {
  return (
    <section className="card">
      <h2>精算結果</h2>
      {!hasPayments ? (
        <p className="hint">支払いを記録すると表示されます</p>
      ) : transfers.length === 0 ? (
        <p className="hint">精算の必要はありません</p>
      ) : (
        <ul className="transfers">
          {transfers.map((t) => (
            <li key={`${t.from}-${t.to}`} className="transfer">
              <span>
                <strong>{nameOf(t.from)}</strong>さんが<strong>{nameOf(t.to)}</strong>さんに
              </span>
              <span className="transfer-amount">{formatYen(t.amount)}払う</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
