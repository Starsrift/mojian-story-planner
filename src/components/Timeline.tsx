/**
 * 时间线 — 多轨时间线视图
 *
 * 纯 React + 内联样式实现 (不依赖 D3):
 * - 每条轨道 (track) 一行: 左侧固定 120px 显示轨道名, 右侧事件卡片按 order 水平排列
 * - 事件卡片显示标题 / 描述 / 关联角色头像, 顶部色条取自 event.color
 * - 点击卡片弹出编辑 Modal (标题 / 描述 / 轨道 / 章节 / 角色 / 颜色, 左右移序, 删除)
 * - 每条轨道末尾有 "+" 添加事件; 列表底部有 "新建轨道" 按钮
 * - 事件为空时显示空状态提示
 */
import { useMemo, useState, type CSSProperties } from 'react'
import { useStore } from '../store/useStore'
import type { Character, StoryCard, TimelineEvent } from '../types'

/** 颜色调色板 (与温暖纸质感主题协调) */
const COLOR_PALETTE = [
  '#8b5e3c', '#c4683f', '#5a7a4a', '#c08a3e', '#7a6a8b',
  '#3c6e8b', '#b5651d', '#6b8e6b', '#a0522d', '#8b6f47',
]

/** 占位 id, 用于尚未持久化的新建草稿 */
const NEW_ID = '__new__'

export function Timeline() {
  const events = useStore((s) => s.timelineEvents)
  const storyCards = useStore((s) => s.storyCards)
  const characters = useStore((s) => s.characters)
  const createTimelineEvent = useStore((s) => s.createTimelineEvent)
  const updateTimelineEvent = useStore((s) => s.updateTimelineEvent)
  const deleteTimelineEvent = useStore((s) => s.deleteTimelineEvent)

  // ===== 唯一轨道列表 (按首次出现顺序) =====
  const tracks = useMemo(() => {
    const seen = new Set<string>()
    const list: string[] = []
    events.forEach((e) => {
      if (!seen.has(e.track)) {
        seen.add(e.track)
        list.push(e.track)
      }
    })
    return list
  }, [events])

  // ===== 查找映射 =====
  const characterById = useMemo(() => {
    const m = new Map<string, Character>()
    characters.forEach((c) => m.set(c.id, c))
    return m
  }, [characters])

  const cardById = useMemo(() => {
    const m = new Map<string, StoryCard>()
    storyCards.forEach((c) => m.set(c.id, c))
    return m
  }, [storyCards])

  // ===== 编辑 Modal 状态 =====
  const [draft, setDraft] = useState<TimelineEvent | null>(null)
  const [isNew, setIsNew] = useState(false)

  // ===== 新建轨道 (内联输入) =====
  const [addingTrack, setAddingTrack] = useState(false)
  const [newTrackName, setNewTrackName] = useState('')

  // ===== 下一可用 order (全局递增, 避免跨轨道冲突) =====
  function nextOrder(): number {
    if (events.length === 0) return 0
    return Math.max(...events.map((e) => e.order)) + 1
  }

  /** 打开新建事件 Modal */
  function openNew(track: string) {
    const newDraft: TimelineEvent = {
      id: NEW_ID,
      projectId: '',
      title: '新事件',
      description: '',
      track,
      order: nextOrder(),
      chapterId: undefined,
      characterIds: [],
      color: COLOR_PALETTE[tracks.length % COLOR_PALETTE.length],
      createdAt: 0,
      updatedAt: 0,
    }
    setIsNew(true)
    setDraft(newDraft)
  }

  /** 打开编辑事件 Modal */
  function openEdit(event: TimelineEvent) {
    setIsNew(false)
    setDraft({ ...event })
  }

  /** 保存草稿 (新建或更新) */
  async function saveDraft() {
    if (!draft) return
    const payload: Partial<TimelineEvent> = {
      title: draft.title,
      description: draft.description,
      track: draft.track.trim() || '未命名轨道',
      order: draft.order,
      chapterId: draft.chapterId,
      characterIds: draft.characterIds,
      color: draft.color,
    }
    if (isNew) {
      await createTimelineEvent(payload)
    } else {
      await updateTimelineEvent(draft.id, payload)
    }
    setDraft(null)
  }

  /** 删除事件 */
  async function removeEvent(id: string) {
    await deleteTimelineEvent(id)
    setDraft(null)
  }

  /**
   * 同轨道内左右移动 (与相邻事件交换 order)
   * 返回被移动事件的新 order, 供 Modal 同步草稿
   */
  async function moveEvent(event: TimelineEvent, dir: -1 | 1): Promise<number | undefined> {
    const sameTrack = events
      .filter((e) => e.track === event.track)
      .sort((a, b) => a.order - b.order)
    const idx = sameTrack.findIndex((e) => e.id === event.id)
    const targetIdx = idx + dir
    if (idx < 0 || targetIdx < 0 || targetIdx >= sameTrack.length) return undefined
    const target = sameTrack[targetIdx]
    await updateTimelineEvent(event.id, { order: target.order })
    await updateTimelineEvent(target.id, { order: event.order })
    return target.order
  }

  /** 确认新建轨道 -> 打开新事件 Modal 并预填轨道名 */
  function confirmAddTrack() {
    const name = newTrackName.trim()
    if (!name) return
    setAddingTrack(false)
    setNewTrackName('')
    openNew(name)
  }

  function cancelAddTrack() {
    setAddingTrack(false)
    setNewTrackName('')
  }

  // ===== Modal 中移序按钮可用性 =====
  const draftTrackEvents = draft
    ? events.filter((e) => e.track === draft.track).sort((a, b) => a.order - b.order)
    : []
  const draftIdx = draft ? draftTrackEvents.findIndex((e) => e.id === draft.id) : -1
  const canMoveLeft = !isNew && draftIdx > 0
  const canMoveRight = !isNew && draftIdx >= 0 && draftIdx < draftTrackEvents.length - 1

  const eventModal = draft ? (
    <EventEditModal
      draft={draft}
      isNew={isNew}
      tracks={tracks}
      storyCards={storyCards}
      characters={characters}
      canMoveLeft={canMoveLeft}
      canMoveRight={canMoveRight}
      onChange={(patch) => setDraft((d) => (d ? { ...d, ...patch } : d))}
      onClose={() => setDraft(null)}
      onSave={saveDraft}
      onDelete={() => removeEvent(draft.id)}
      onMoveLeft={async () => {
        const newOrder = await moveEvent(draft, -1)
        if (newOrder !== undefined) {
          setDraft((d) => (d ? { ...d, order: newOrder } : d))
        }
      }}
      onMoveRight={async () => {
        const newOrder = await moveEvent(draft, 1)
        if (newOrder !== undefined) {
          setDraft((d) => (d ? { ...d, order: newOrder } : d))
        }
      }}
    />
  ) : null

  // ===== 空状态 =====
  if (events.length === 0) {
    return (
      <>
        <div style={styles.emptyWrap}>
          <div style={styles.emptyTitle}>时间线</div>
          <div style={styles.emptyHint}>
            还没有时间线事件。添加第一条事件或新建一条轨道, 开始编排故事的时间脉络。
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={() => openNew('主线')}>
              + 添加事件
            </button>
            <button className="btn" onClick={() => setAddingTrack(true)}>
              + 新建轨道
            </button>
          </div>
          {addingTrack && (
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <input
                className="form-input"
                autoFocus
                placeholder="轨道名称 (如 主线 / 支线 / 角色线)"
                value={newTrackName}
                onChange={(e) => setNewTrackName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmAddTrack()
                  if (e.key === 'Escape') cancelAddTrack()
                }}
                style={{ width: 280 }}
              />
              <button className="btn btn-primary" onClick={confirmAddTrack}>
                创建
              </button>
              <button className="btn" onClick={cancelAddTrack}>
                取消
              </button>
            </div>
          )}
        </div>
        {eventModal}
      </>
    )
  }

  return (
    <div style={styles.view}>
      {/* 头部 */}
      <div style={styles.header}>
        <div>
          <div style={styles.headerTitle}>时间线</div>
          <div style={styles.headerSub}>
            {tracks.length} 条轨道 · {events.length} 个事件
          </div>
        </div>
        <button className="btn" onClick={() => setAddingTrack(true)}>
          + 新建轨道
        </button>
      </div>

      {/* 轨道列表 */}
      <div style={styles.trackList}>
        {tracks.map((track) => {
          const trackEvents = events
            .filter((e) => e.track === track)
            .sort((a, b) => a.order - b.order)
          return (
            <div key={track} style={styles.track}>
              <div style={styles.trackLabel}>
                <span className="text-truncate" style={{ fontWeight: 600, fontSize: 14 }}>
                  {track}
                </span>
                <span style={styles.trackCount}>{trackEvents.length}</span>
              </div>
              <div style={styles.trackEvents}>
                {trackEvents.map((e, i) => (
                  <EventCard
                    key={e.id}
                    event={e}
                    characterById={characterById}
                    cardById={cardById}
                    onClick={() => openEdit(e)}
                    onMoveLeft={() => moveEvent(e, -1)}
                    onMoveRight={() => moveEvent(e, 1)}
                    canMoveLeft={i > 0}
                    canMoveRight={i < trackEvents.length - 1}
                  />
                ))}
                <button
                  className="icon-btn"
                  style={styles.addEventBtn}
                  title="在该轨道添加事件"
                  onClick={() => openNew(track)}
                >
                  +
                </button>
              </div>
            </div>
          )
        })}

        {/* 新建轨道 (内联输入行) */}
        {addingTrack && (
          <div style={styles.track}>
            <div style={{ ...styles.trackLabel, justifyContent: 'center' }}>
              <input
                className="form-input"
                autoFocus
                placeholder="新轨道名"
                value={newTrackName}
                onChange={(e) => setNewTrackName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmAddTrack()
                  if (e.key === 'Escape') cancelAddTrack()
                }}
                style={{ padding: '4px 8px', fontSize: 13 }}
              />
            </div>
            <div style={{ ...styles.trackEvents, justifyContent: 'flex-start' }}>
              <button className="btn btn-primary" onClick={confirmAddTrack}>
                创建并添加事件
              </button>
              <button className="btn" onClick={cancelAddTrack}>
                取消
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 编辑 Modal */}
      {eventModal}
    </div>
  )
}

// ============================================================
// 事件卡片
// ============================================================
interface EventCardProps {
  event: TimelineEvent
  characterById: Map<string, Character>
  cardById: Map<string, StoryCard>
  onClick: () => void
  onMoveLeft: () => void
  onMoveRight: () => void
  canMoveLeft: boolean
  canMoveRight: boolean
}

function EventCard({
  event,
  characterById,
  cardById,
  onClick,
  onMoveLeft,
  onMoveRight,
  canMoveLeft,
  canMoveRight,
}: EventCardProps) {
  const [hover, setHover] = useState(false)
  const chapter = event.chapterId ? cardById.get(event.chapterId) : undefined

  return (
    <div
      style={{
        ...styles.eventCard,
        borderTop: `4px solid ${event.color}`,
        boxShadow: hover ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        transform: hover ? 'translateY(-1px)' : 'none',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* 左右移序按钮 (与可点击区域为兄弟, 不会触发 openEdit) */}
      <div style={styles.eventMoveBtns}>
        <button
          className="icon-btn"
          style={styles.moveBtn}
          disabled={!canMoveLeft}
          onClick={onMoveLeft}
          title="左移"
        >
          ‹
        </button>
        <button
          className="icon-btn"
          style={styles.moveBtn}
          disabled={!canMoveRight}
          onClick={onMoveRight}
          title="右移"
        >
          ›
        </button>
      </div>

      <div onClick={onClick} style={{ cursor: 'pointer', minWidth: 0 }}>
        <div className="text-truncate" style={styles.eventTitle}>
          {event.title}
        </div>
        {event.description && (
          <div className="text-truncate" style={styles.eventDesc}>
            {event.description}
          </div>
        )}
        <div style={styles.eventMeta}>
          {event.characterIds.slice(0, 5).map((cid) => {
            const c = characterById.get(cid)
            if (!c) return null
            return (
              <div
                key={cid}
                style={{ ...styles.avatar, background: c.color }}
                title={c.name}
              >
                {c.name.charAt(0)}
              </div>
            )
          })}
          {event.characterIds.length > 5 && (
            <span style={styles.avatarMore}>+{event.characterIds.length - 5}</span>
          )}
          {chapter && (
            <span style={styles.chapterTag} title={chapter.title}>
              § {chapter.title}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// 事件编辑 Modal
// ============================================================
interface EventEditModalProps {
  draft: TimelineEvent
  isNew: boolean
  tracks: string[]
  storyCards: StoryCard[]
  characters: Character[]
  canMoveLeft: boolean
  canMoveRight: boolean
  onChange: (patch: Partial<TimelineEvent>) => void
  onClose: () => void
  onSave: () => void
  onDelete: () => void
  onMoveLeft: () => void
  onMoveRight: () => void
}

function EventEditModal({
  draft,
  isNew,
  tracks,
  storyCards,
  characters,
  canMoveLeft,
  canMoveRight,
  onChange,
  onClose,
  onSave,
  onDelete,
  onMoveLeft,
  onMoveRight,
}: EventEditModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-panel"
        style={{ maxWidth: 560 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div style={styles.modalHeader}>
          <div style={styles.modalTitle}>{isNew ? '新建事件' : '编辑事件'}</div>
          <button className="icon-btn" onClick={onClose} title="关闭">
            ✕
          </button>
        </div>

        {/* 主体表单 */}
        <div style={styles.modalBody}>
          <div style={styles.field}>
            <label className="form-label">标题</label>
            <input
              className="form-input"
              value={draft.title}
              onChange={(e) => onChange({ title: e.target.value })}
              placeholder="事件标题"
            />
          </div>

          <div style={styles.field}>
            <label className="form-label">描述</label>
            <textarea
              className="form-textarea"
              value={draft.description}
              onChange={(e) => onChange({ description: e.target.value })}
              placeholder="简述这个事件发生的事…"
              rows={3}
            />
          </div>

          <div style={styles.fieldRow}>
            <div style={styles.field}>
              <label className="form-label">轨道</label>
              <input
                className="form-input"
                list="timeline-track-list"
                value={draft.track}
                onChange={(e) => onChange({ track: e.target.value })}
                placeholder="选择或输入新轨道名"
              />
              <datalist id="timeline-track-list">
                {tracks.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
            <div style={styles.field}>
              <label className="form-label">关联章节</label>
              <select
                className="form-select"
                value={draft.chapterId || ''}
                onChange={(e) => onChange({ chapterId: e.target.value || undefined })}
              >
                <option value="">无</option>
                {storyCards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={styles.field}>
            <label className="form-label">参与角色</label>
            <div style={styles.checkboxGrid}>
              {characters.length === 0 && (
                <div style={styles.emptyInline}>暂无角色, 可先在「人物图」中创建</div>
              )}
              {characters.map((c) => {
                const checked = draft.characterIds.includes(c.id)
                return (
                  <label key={c.id} style={styles.checkboxItem}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...draft.characterIds, c.id]
                          : draft.characterIds.filter((id) => id !== c.id)
                        onChange({ characterIds: next })
                      }}
                    />
                    <span style={{ ...styles.avatarSmall, background: c.color }}>
                      {c.name.charAt(0)}
                    </span>
                    <span className="text-truncate">{c.name}</span>
                  </label>
                )
              })}
            </div>
          </div>

          <div style={styles.field}>
            <label className="form-label">颜色</label>
            <div style={styles.colorRow}>
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  style={{
                    ...styles.colorSwatch,
                    background: c,
                    boxShadow:
                      draft.color.toLowerCase() === c.toLowerCase()
                        ? '0 0 0 2px var(--bg-panel), 0 0 0 4px var(--ink)'
                        : 'none',
                  }}
                  onClick={() => onChange({ color: c })}
                  title={c}
                />
              ))}
              <label style={styles.colorPickerWrap} title="自定义颜色">
                <input
                  type="color"
                  value={draft.color}
                  onChange={(e) => onChange({ color: e.target.value })}
                  style={styles.colorPicker}
                />
              </label>
            </div>
          </div>
        </div>

        {/* 底部操作栏 */}
        <div style={styles.modalFooter}>
          <div style={{ display: 'flex', gap: 8 }}>
            {!isNew && (
              <>
                <button className="btn" disabled={!canMoveLeft} onClick={onMoveLeft}>
                  ‹ 左移
                </button>
                <button className="btn" disabled={!canMoveRight} onClick={onMoveRight}>
                  右移 ›
                </button>
                <button className="btn btn-danger" onClick={onDelete}>
                  删除
                </button>
              </>
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
  headerSub: {
    fontSize: 12,
    color: 'var(--muted)',
    marginTop: 2,
  },
  trackList: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  track: {
    display: 'flex',
    background: 'var(--bg-panel)',
    border: '1px solid var(--rule)',
    borderRadius: 8,
    boxShadow: 'var(--shadow-sm)',
    overflow: 'hidden',
    minHeight: 96,
  },
  trackLabel: {
    width: 120,
    flex: '0 0 120px',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 6,
    background: 'var(--bg2)',
    borderRight: '1px solid var(--rule)',
    justifyContent: 'center',
  },
  trackCount: {
    fontSize: 11,
    color: 'var(--muted)',
    background: 'var(--bg3)',
    padding: '1px 8px',
    borderRadius: 999,
  },
  trackEvents: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '12px',
    overflowX: 'auto',
  },
  addEventBtn: {
    flex: '0 0 auto',
    width: 34,
    height: 60,
    borderRadius: 8,
    border: '1px dashed var(--rule)',
    color: 'var(--muted)',
    fontSize: 20,
    fontWeight: 300,
  },
  eventCard: {
    position: 'relative',
    flex: '0 0 auto',
    width: 200,
    background: 'var(--bg-panel)',
    border: '1px solid var(--rule)',
    borderRadius: 8,
    padding: '10px 12px',
    transition: 'box-shadow 160ms, transform 160ms',
  },
  eventMoveBtns: {
    position: 'absolute',
    top: 4,
    right: 4,
    display: 'flex',
    gap: 0,
  },
  moveBtn: {
    width: 20,
    height: 20,
    fontSize: 14,
    lineHeight: 1,
    color: 'var(--muted)',
  },
  eventTitle: {
    fontWeight: 600,
    fontSize: 14,
    color: 'var(--ink)',
    paddingRight: 36,
  },
  eventDesc: {
    fontSize: 12,
    color: 'var(--muted)',
    marginTop: 2,
  },
  eventMeta: {
    display: 'flex',
    gap: 4,
    marginTop: 8,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  avatar: {
    width: 20,
    height: 20,
    borderRadius: '50%',
    color: '#fff',
    fontSize: 11,
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: '0 0 auto',
  },
  avatarMore: {
    fontSize: 11,
    color: 'var(--muted)',
  },
  chapterTag: {
    fontSize: 11,
    color: 'var(--accent)',
    background: 'var(--accent-soft)',
    padding: '1px 6px',
    borderRadius: 999,
    maxWidth: 90,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
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
  checkboxGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: 6,
    padding: 8,
    background: 'var(--bg2)',
    border: '1px solid var(--rule)',
    borderRadius: 8,
    maxHeight: 168,
    overflowY: 'auto',
  },
  checkboxItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 6px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
    color: 'var(--ink)',
    minWidth: 0,
  },
  avatarSmall: {
    width: 18,
    height: 18,
    borderRadius: '50%',
    color: '#fff',
    fontSize: 10,
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: '0 0 auto',
  },
  emptyInline: {
    fontSize: 12,
    color: 'var(--muted)',
    padding: '4px 6px',
    gridColumn: '1 / -1',
  },
  colorRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  colorSwatch: {
    width: 24,
    height: 24,
    borderRadius: 6,
    border: '1px solid var(--rule)',
    cursor: 'pointer',
    padding: 0,
  },
  colorPickerWrap: {
    width: 28,
    height: 28,
    borderRadius: 6,
    border: '1px solid var(--rule)',
    overflow: 'hidden',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorPicker: {
    width: 40,
    height: 40,
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    background: 'none',
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
    gap: 10,
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
