/**
 * 伏笔追踪表 — 表格视图
 *
 * 纯 React + 内联样式实现:
 * - 表格列: 伏笔名称 | 状态 | 优先级 | 埋设章节 | 回收章节 | 操作
 * - 状态彩色标签: planted=黄"已埋设" / resolved=绿"已回收" / abandoned=灰"已放弃"
 * - 优先级颜色: high=红 / medium=橙 / low=蓝
 * - 章节列通过 chapterId 查找 storyCard.title
 * - 顶部统计: 总数 / 已回收 / 未闭合; 按状态筛选
 * - 点击行或编辑按钮弹出 Modal 编辑; 支持删除
 * - 伏笔为空时显示空状态提示
 */
import { useMemo, useState, type CSSProperties } from 'react'
import { useStore } from '../store/useStore'
import type { Foreshadow, StoryCard } from '../types'

type ForeshadowStatus = Foreshadow['status']
type ForeshadowPriority = Foreshadow['priority']
type StatusFilter = 'all' | ForeshadowStatus

/** 状态标签与配色 */
const STATUS_META: Record<
  ForeshadowStatus,
  { label: string; color: string; background: string; border: string }
> = {
  planted: {
    label: '已埋设',
    color: '#8a6610',
    background: 'var(--warning-soft)',
    border: 'var(--warning)',
  },
  resolved: {
    label: '已回收',
    color: 'var(--success)',
    background: 'var(--success-soft)',
    border: 'var(--success)',
  },
  abandoned: {
    label: '已放弃',
    color: 'var(--muted)',
    background: 'var(--bg3)',
    border: 'var(--rule)',
  },
}

/** 优先级标签与配色 */
const PRIORITY_META: Record<
  ForeshadowPriority,
  { label: string; color: string; background: string }
> = {
  high: { label: '高', color: '#fff', background: 'var(--danger)' },
  medium: { label: '中', color: '#fff', background: 'var(--accent2)' },
  low: { label: '低', color: '#fff', background: '#3c6e8b' },
}

const FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'planted', label: '已埋设' },
  { value: 'resolved', label: '已回收' },
  { value: 'abandoned', label: '已放弃' },
]

/** 占位 id, 用于尚未持久化的新建草稿 */
const NEW_ID = '__new__'

export function ForeshadowTable() {
  const foreshadows = useStore((s) => s.foreshadows)
  const storyCards = useStore((s) => s.storyCards)
  const createForeshadow = useStore((s) => s.createForeshadow)
  const updateForeshadow = useStore((s) => s.updateForeshadow)
  const deleteForeshadow = useStore((s) => s.deleteForeshadow)

  // ===== 章节查找映射 =====
  const cardById = useMemo(() => {
    const m = new Map<string, StoryCard>()
    storyCards.forEach((c) => m.set(c.id, c))
    return m
  }, [storyCards])

  // ===== 筛选 =====
  const [filter, setFilter] = useState<StatusFilter>('all')

  const filtered = useMemo(() => {
    const list = filter === 'all' ? foreshadows : foreshadows.filter((f) => f.status === filter)
    return [...list].sort((a, b) => b.createdAt - a.createdAt)
  }, [foreshadows, filter])

  // ===== 统计 (基于全部, 不受筛选影响) =====
  const stats = useMemo(() => {
    const total = foreshadows.length
    const resolved = foreshadows.filter((f) => f.status === 'resolved').length
    const unclosed = foreshadows.filter((f) => f.status === 'planted').length
    return { total, resolved, unclosed }
  }, [foreshadows])

  // ===== 编辑 Modal 状态 =====
  const [draft, setDraft] = useState<Foreshadow | null>(null)
  const [isNew, setIsNew] = useState(false)

  /** 打开新建伏笔 Modal */
  function openNew() {
    const newDraft: Foreshadow = {
      id: NEW_ID,
      projectId: '',
      title: '新伏笔',
      description: '',
      plantChapterId: undefined,
      plantDescription: '',
      resolveChapterId: undefined,
      resolveDescription: '',
      status: 'planted',
      priority: 'medium',
      createdAt: 0,
      updatedAt: 0,
    }
    setIsNew(true)
    setDraft(newDraft)
  }

  /** 打开编辑伏笔 Modal */
  function openEdit(f: Foreshadow) {
    setIsNew(false)
    setDraft({ ...f })
  }

  /** 保存草稿 (新建或更新) */
  async function saveDraft() {
    if (!draft) return
    const payload: Partial<Foreshadow> = {
      title: draft.title,
      description: draft.description,
      plantChapterId: draft.plantChapterId,
      plantDescription: draft.plantDescription,
      resolveChapterId: draft.resolveChapterId,
      resolveDescription: draft.resolveDescription,
      status: draft.status,
      priority: draft.priority,
    }
    if (isNew) {
      await createForeshadow(payload)
    } else {
      await updateForeshadow(draft.id, payload)
    }
    setDraft(null)
  }

  /** 删除伏笔 */
  async function removeForeshadow(id: string) {
    await deleteForeshadow(id)
    setDraft(null)
  }

  const editModal = draft ? (
    <ForeshadowEditModal
      draft={draft}
      isNew={isNew}
      storyCards={storyCards}
      onChange={(patch) => setDraft((d) => (d ? { ...d, ...patch } : d))}
      onClose={() => setDraft(null)}
      onSave={saveDraft}
      onDelete={() => removeForeshadow(draft.id)}
    />
  ) : null

  // ===== 空状态 =====
  if (foreshadows.length === 0) {
    return (
      <>
        <div style={styles.emptyWrap}>
          <div style={styles.emptyTitle}>伏笔追踪</div>
          <div style={styles.emptyHint}>
            还没有伏笔记录。埋下第一条伏笔, 追踪它在何处被回收或放弃。
          </div>
          <button className="btn btn-primary" onClick={openNew}>
            + 添加伏笔
          </button>
        </div>
        {editModal}
      </>
    )
  }

  return (
    <div style={styles.view}>
      {/* 头部: 标题 + 添加按钮 */}
      <div style={styles.header}>
        <div>
          <div style={styles.headerTitle}>伏笔追踪</div>
          <div style={styles.statRow}>
            <StatChip label="总数" value={stats.total} color="var(--accent)" />
            <StatChip label="已回收" value={stats.resolved} color="var(--success)" />
            <StatChip label="未闭合" value={stats.unclosed} color="var(--warning)" />
          </div>
        </div>
        <button className="btn btn-primary" onClick={openNew}>
          + 添加伏笔
        </button>
      </div>

      {/* 筛选条 */}
      <div style={styles.filterBar}>
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            className="btn"
            style={
              filter === opt.value
                ? { background: 'var(--accent)', borderColor: 'var(--accent)', color: 'var(--accent-ink)' }
                : undefined
            }
            onClick={() => setFilter(opt.value)}
          >
            {opt.label}
            <span style={{ marginLeft: 4, opacity: 0.7, fontSize: 11 }}>
              {opt.value === 'all'
                ? foreshadows.length
                : foreshadows.filter((f) => f.status === opt.value).length}
            </span>
          </button>
        ))}
      </div>

      {/* 表格 */}
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <colgroup>
            <col style={{ width: '26%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '22%' }} />
            <col style={{ width: '22%' }} />
            <col style={{ width: '10%' }} />
          </colgroup>
          <thead>
            <tr>
              <th style={styles.th}>伏笔名称</th>
              <th style={styles.th}>状态</th>
              <th style={styles.th}>优先级</th>
              <th style={styles.th}>埋设章节</th>
              <th style={styles.th}>回收章节</th>
              <th style={styles.th}>操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} style={styles.emptyRow}>
                  当前筛选下没有伏笔
                </td>
              </tr>
            )}
            {filtered.map((f) => {
              const plantCard = f.plantChapterId ? cardById.get(f.plantChapterId) : undefined
              const resolveCard = f.resolveChapterId ? cardById.get(f.resolveChapterId) : undefined
              return (
                <tr key={f.id} style={styles.tr} onClick={() => openEdit(f)}>
                  <td style={styles.td}>
                    <div style={styles.cellTitle} className="text-truncate">{f.title}</div>
                    {f.description && (
                      <div style={styles.cellDesc} className="text-truncate">{f.description}</div>
                    )}
                  </td>
                  <td style={styles.td}>
                    <StatusTag status={f.status} />
                  </td>
                  <td style={styles.td}>
                    <PriorityTag priority={f.priority} />
                  </td>
                  <td style={styles.td}>
                    {plantCard ? (
                      <span style={styles.chapterCell} title={plantCard.title}>
                        § {plantCard.title}
                      </span>
                    ) : (
                      <span style={styles.cellMuted}>—</span>
                    )}
                  </td>
                  <td style={styles.td}>
                    {resolveCard ? (
                      <span style={styles.chapterCell} title={resolveCard.title}>
                        § {resolveCard.title}
                      </span>
                    ) : (
                      <span style={styles.cellMuted}>—</span>
                    )}
                  </td>
                  <td style={styles.td}>
                    <button
                      className="icon-btn"
                      style={styles.editBtn}
                      title="编辑"
                      onClick={(e) => {
                        e.stopPropagation()
                        openEdit(f)
                      }}
                    >
                      ✎
                    </button>
                    <button
                      className="icon-btn"
                      style={{ ...styles.editBtn, color: 'var(--danger)' }}
                      title="删除"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (window.confirm(`确认删除伏笔「${f.title}」?`)) {
                          removeForeshadow(f.id)
                        }
                      }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 编辑 Modal */}
      {editModal}
    </div>
  )
}

// ============================================================
// 统计芯片
// ============================================================
function StatChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={styles.statChip}>
      <span style={{ color: 'var(--muted)', fontSize: 12 }}>{label}</span>
      <span style={{ color, fontWeight: 700, fontSize: 16 }}>{value}</span>
    </div>
  )
}

// ============================================================
// 状态 / 优先级 标签
// ============================================================
function StatusTag({ status }: { status: ForeshadowStatus }) {
  const meta = STATUS_META[status]
  return (
    <span
      style={{
        ...styles.tag,
        color: meta.color,
        background: meta.background,
        border: `1px solid ${meta.border}`,
      }}
    >
      {meta.label}
    </span>
  )
}

function PriorityTag({ priority }: { priority: ForeshadowPriority }) {
  const meta = PRIORITY_META[priority]
  return (
    <span
      style={{
        ...styles.tag,
        color: meta.color,
        background: meta.background,
        border: 'none',
      }}
    >
      {meta.label}
    </span>
  )
}

// ============================================================
// 伏笔编辑 Modal
// ============================================================
interface ForeshadowEditModalProps {
  draft: Foreshadow
  isNew: boolean
  storyCards: StoryCard[]
  onChange: (patch: Partial<Foreshadow>) => void
  onClose: () => void
  onSave: () => void
  onDelete: () => void
}

function ForeshadowEditModal({
  draft,
  isNew,
  storyCards,
  onChange,
  onClose,
  onSave,
  onDelete,
}: ForeshadowEditModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-panel"
        style={{ maxWidth: 600 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div style={styles.modalHeader}>
          <div style={styles.modalTitle}>{isNew ? '新建伏笔' : '编辑伏笔'}</div>
          <button className="icon-btn" onClick={onClose} title="关闭">
            ✕
          </button>
        </div>

        {/* 主体表单 */}
        <div style={styles.modalBody}>
          <div style={styles.field}>
            <label className="form-label">伏笔名称</label>
            <input
              className="form-input"
              value={draft.title}
              onChange={(e) => onChange({ title: e.target.value })}
              placeholder="给这条伏笔起个名字"
            />
          </div>

          <div style={styles.field}>
            <label className="form-label">伏笔内容</label>
            <textarea
              className="form-textarea"
              value={draft.description}
              onChange={(e) => onChange({ description: e.target.value })}
              placeholder="描述这条伏笔的具体内容…"
              rows={2}
            />
          </div>

          <div style={styles.fieldRow}>
            <div style={styles.field}>
              <label className="form-label">状态</label>
              <select
                className="form-select"
                value={draft.status}
                onChange={(e) => onChange({ status: e.target.value as ForeshadowStatus })}
              >
                <option value="planted">已埋设</option>
                <option value="resolved">已回收</option>
                <option value="abandoned">已放弃</option>
              </select>
            </div>
            <div style={styles.field}>
              <label className="form-label">优先级</label>
              <select
                className="form-select"
                value={draft.priority}
                onChange={(e) => onChange({ priority: e.target.value as ForeshadowPriority })}
              >
                <option value="high">高</option>
                <option value="medium">中</option>
                <option value="low">低</option>
              </select>
            </div>
          </div>

          {/* 埋设信息 */}
          <div style={styles.sectionTitle}>埋设</div>
          <div style={styles.field}>
            <label className="form-label">埋设章节</label>
            <select
              className="form-select"
              value={draft.plantChapterId || ''}
              onChange={(e) => onChange({ plantChapterId: e.target.value || undefined })}
            >
              <option value="">无</option>
              {storyCards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
          <div style={styles.field}>
            <label className="form-label">埋设描述</label>
            <textarea
              className="form-textarea"
              value={draft.plantDescription}
              onChange={(e) => onChange({ plantDescription: e.target.value })}
              placeholder="伏笔是在什么场景、以何种方式埋下的…"
              rows={2}
            />
          </div>

          {/* 回收信息 */}
          <div style={styles.sectionTitle}>回收</div>
          <div style={styles.field}>
            <label className="form-label">回收章节</label>
            <select
              className="form-select"
              value={draft.resolveChapterId || ''}
              onChange={(e) => onChange({ resolveChapterId: e.target.value || undefined })}
            >
              <option value="">无</option>
              {storyCards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
          <div style={styles.field}>
            <label className="form-label">回收描述</label>
            <textarea
              className="form-textarea"
              value={draft.resolveDescription}
              onChange={(e) => onChange({ resolveDescription: e.target.value })}
              placeholder="伏笔是如何被回收 / 揭示的…"
              rows={2}
            />
          </div>
        </div>

        {/* 底部操作栏 */}
        <div style={styles.modalFooter}>
          <div style={{ display: 'flex', gap: 8 }}>
            {!isNew && (
              <button className="btn btn-danger" onClick={onDelete}>
                删除
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={onClose}>
              取消
            </button>
            <button className="btn btn-primary" onClick={onSave}>
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// 样式
// ============================================================
const styles: Record<string, CSSProperties> = {
  view: {
    height: '100%',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 20px',
    borderBottom: '1px solid var(--rule)',
    background: 'var(--bg-panel)',
    flex: '0 0 auto',
  },
  headerTitle: {
    fontFamily: "'Songti SC', 'STSong', 'SimSun', serif",
    fontSize: 20,
    letterSpacing: 3,
    color: 'var(--accent)',
    fontWeight: 700,
  },
  statRow: {
    display: 'flex',
    gap: 16,
    marginTop: 6,
  },
  statChip: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 6,
  },
  filterBar: {
    display: 'flex',
    gap: 8,
    padding: '12px 20px',
    borderBottom: '1px solid var(--rule)',
    flex: '0 0 auto',
    flexWrap: 'wrap',
  },
  tableWrap: {
    flex: 1,
    overflow: 'auto',
    padding: '0 20px 20px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    background: 'var(--bg-panel)',
    border: '1px solid var(--rule)',
    borderRadius: 8,
    overflow: 'hidden',
    fontSize: 13,
  },
  th: {
    textAlign: 'left',
    padding: '10px 12px',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--muted)',
    background: 'var(--bg2)',
    borderBottom: '1px solid var(--rule)',
    whiteSpace: 'nowrap',
    position: 'sticky' as const,
    top: 0,
    zIndex: 1,
  },
  tr: {
    cursor: 'pointer',
    transition: 'background 120ms',
    borderBottom: '1px solid var(--rule)',
  },
  td: {
    padding: '10px 12px',
    verticalAlign: 'middle',
    color: 'var(--ink)',
  },
  cellTitle: {
    fontWeight: 600,
    fontSize: 14,
    color: 'var(--ink)',
    maxWidth: 280,
  },
  cellDesc: {
    fontSize: 12,
    color: 'var(--muted)',
    marginTop: 2,
    maxWidth: 280,
  },
  cellMuted: {
    color: 'var(--muted)',
  },
  chapterCell: {
    color: 'var(--accent)',
    fontSize: 13,
  },
  tag: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2px 10px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: 'nowrap',
    minWidth: 32,
  },
  editBtn: {
    width: 28,
    height: 28,
    fontSize: 14,
    marginRight: 2,
  },
  emptyRow: {
    padding: '32px 12px',
    textAlign: 'center',
    color: 'var(--muted)',
    fontSize: 13,
  },
  // ===== Modal =====
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 18px',
    borderBottom: '1px solid var(--rule)',
  },
  modalTitle: {
    fontFamily: "'Songti SC', 'STSong', 'SimSun', serif",
    fontSize: 18,
    letterSpacing: 2,
    color: 'var(--ink)',
    fontWeight: 700,
  },
  modalBody: {
    padding: '16px 18px',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--accent)',
    letterSpacing: 2,
    marginTop: 4,
    paddingBottom: 4,
    borderBottom: '1px dashed var(--rule)',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minWidth: 0,
  },
  fieldRow: {
    display: 'flex',
    gap: 12,
  },
  modalFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: '14px 18px',
    borderTop: '1px solid var(--rule)',
  },
  // ===== 空状态 =====
  emptyWrap: {
    height: '100%',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
    background: 'var(--bg)',
  },
  emptyTitle: {
    fontFamily: "'Songti SC', 'STSong', 'SimSun', serif",
    fontSize: 24,
    letterSpacing: 4,
    color: 'var(--muted)',
  },
  emptyHint: {
    fontSize: 14,
    color: 'var(--muted)',
    maxWidth: 420,
    textAlign: 'center',
    lineHeight: 1.7,
  },
}
