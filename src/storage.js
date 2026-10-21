// ローカルストレージへの保存・読み込み

const STORAGE_KEY = 'trip-splitter:data'
// 保存データの構造を変えたときはこの番号を上げ、loadData で移行処理を書く
const DATA_VERSION = 1

export function createInitialData() {
  return {
    version: DATA_VERSION,
    members: [],
    // 外貨は1種類だけ。code は表示用、rate は「1外貨＝何円」（入力途中を保てるよう文字列で持つ）
    foreign: { code: 'USD', rate: '' },
    payments: [],
  }
}

export function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return createInitialData()
    const data = JSON.parse(raw)
    if (data?.version !== DATA_VERSION) return createInitialData()
    const initial = createInitialData()
    return {
      version: DATA_VERSION,
      members: Array.isArray(data.members) ? data.members : initial.members,
      foreign: { ...initial.foreign, ...data.foreign },
      payments: Array.isArray(data.payments) ? data.payments : initial.payments,
    }
  } catch {
    // 壊れたデータやストレージが使えない環境では空の状態から始める
    return createInitialData()
  }
}

export function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // プライベートモードなどで保存できなくても画面は動かし続ける
  }
}

// http（LAN 内のスマホ確認など）では crypto.randomUUID が使えないため代替を用意する
export function createId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID()
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}
