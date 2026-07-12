/**
 * 百科词条面板 — 世界观设定管理
 *
 * 左右分栏布局:
 * - 左侧 280px 固定列表: 按类型分组(可折叠), 搜索过滤, 添加词条, 类型统计
 * - 右侧 flex:1 详情: 编辑名称/类型/别名/标签/纯文本内容, 保存/删除
 *
 * 类型颜色圆点: character=#e74c3c, location=#27ae60, item=#f39c12,
 *                event=#3498db, concept=#9b59b6, organization=#1abc9c
 */
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useStore } from '../store/useStore'
import type { WikiEntry } from '../types'

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

type WikiType = WikiEntry['type']

const TYPE_META: Record<
  WikiType,
  { label: string; color: string }
> = {
  character:     { label: '角色',   color: '#e74c3c' },
  location:       { label: '地点',   color: '#27ae60' },
  item:           { label: '物品',   color: '#f39c12' },
  event:          { label: '事件',   color: '#3498db' },
  concept:        { label: '概念',   color: '#9b59b6' },
  organization:   { label: '组织',   color: '#1abc9c' },
}

const TYPE_ORDER: WikiType[] = [
  'character', 'location', 'item', 'event', 'concept', 'organization',
]

// ---------------------------------------------------------------------------
// 样式
// ---------------------------------------------------------------------------

const root: CSSProperties = {
  display: 'flex',
  height: '100%',
  background: 'var(--bg)',
  color: 'var(--ink)',
}

// -- 左侧列表 --

const sidebar: CSSProperties = {
  width: 280,
  minWidth: 280,
  borderRight: '1px solid var(--rule)',
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--bg-panel)',
  overflow: 'hidden',
}

const sidebarHeader: CSSProperties = {
  padding: '16px 16px 8px',
  flexShrink: 0,
}

const statsBar: CSSProperties = {
  fontSize: 12,
  color: 'var(--muted)',
  marginBottom: 10,
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  flexWrap: 'wrap' as const,
}

const statsDot: CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: '50%',
  display: 'inline-block',
  marginRight: 3,
}

const searchRow: CSSProperties = {
  display: 'flex',
  gap: 8,
}

const searchInput: CSSProperties = {
  flex: 1,
  padding: '6px 10px',
  border: '1px solid var(--rule)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--bg)',
  color: 'var(--ink)',
  fontSize: 13,
  outline: 'none',
}

const addBtn: CSSProperties = {
  padding: '6px 12px',
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--accent)',
  color: 'var(--accent-ink)',
  fontSize: 13,
  cursor: 'pointer',
  whiteSpace: 'nowrap' as const,
  flexShrink: 0,
}

const listContainer: CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '0 0 12px',
}

const groupHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 16px 4px',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--muted)',
  cursor: 'pointer',
  userSelect: 'none',
}

const groupCount: CSSProperties = {
  fontSize: 11,
  fontWeight: 400,
  color: 'var(--muted)',
  opacity: 0.7,
}

const chevron: CSSProperties = {
  fontSize: 10,
  transition: 'transform var(--transition)',
}

const entryItem: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 16px 6px 24px',
  cursor: 'pointer',
  fontSize: 13,
  transition: 'background var(--transition)',
}

const entryDot: CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: '50%',
  flexShrink: 0,
}

const entryName: CSSProperties = {
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap' as const,
}

const typeTag: CSSProperties = {
  fontSize: 10,
  padding: '1px 6px',
  borderRadius: 'var(--radius-pill)',
  background: 'var(--bg3)',
  color: 'var(--muted)',
  flexShrink: 0,
}

// -- 右侧详情 --

const detailPanel: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
}

const emptyDetail: CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--muted)',
  fontSize: 14,
}

const emptyList: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  padding: 32,
  color: 'var(--muted)',
}

const emptyListTitle: CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
}

const emptyListHint: CSSProperties = {
  fontSize: 12,
  opacity: 0.7,
}

const detailHeader: CSSProperties = {
  padding: '20px 24px 12px',
  borderBottom: '1px solid var(--rule)',
}

const detailTitle: CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  marginBottom: 4,
}

const detailMeta: CSSProperties = {
  fontSize: 12,
  color: 'var(--muted)',
}

const detailBody: CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '20px 24px',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
}

const fieldLabel: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--muted)',
  marginBottom: 4,
}

const textInput: CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid var(--rule)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--bg)',
  color: 'var(--ink)',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box' as const,
}

const textArea: CSSProperties = {
  ...textInput,
  minHeight: 200,
  resize: 'vertical' as const,
  fontFamily: 'inherit',
  lineHeight: 1.7,
}

const selectInput: CSSProperties = {
  ...textInput,
  cursor: 'pointer',
}

const detailFooter: CSSProperties = {
  padding: '12px 24px 20px',
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 10,
  borderTop: '1px solid var(--rule)',
}

const saveBtn: CSSProperties = {
  padding: '8px 20px',
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--accent)',
  color: 'var(--accent-ink)',
  fontSize: 13,
  cursor: 'pointer',
}

const deleteBtn: CSSProperties = {
  padding: '8px 20px',
  border: '1px solid var(--danger)',
  borderRadius: 'var(--radius-sm)',
  background: 'transparent',
  color: 'var(--danger)',
  fontSize: 13,
  cursor: 'pointer',
}

// ---------------------------------------------------------------------------
// 组件
// ---------------------------------------------------------------------------

export function WikiPanel() {
  const wikiEntries = useStore((s) => s.wikiEntries)
  const createWikiEntry = useStore((s) => s.createWikiEntry)
  const updateWikiEntry = useStore((s) => s.updateWikiEntry)
  const deleteWikiEntry = useStore((s) => s.deleteWikiEntry)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [searchText, setSearchText] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<WikiType>>(new Set())
  const [editingName, setEditingName] = useState('')
  const [editingType, setEditingType] = useState<WikiType>('concept')
  const [editingAliases, setEditingAliases] = useState('')
  const [editingTags, setEditingTags] = useState('')
  const [editingContent, setEditingContent] = useState('')

  // ----- 当前选中的词条 -----
  const selectedEntry = useMemo(
    () => wikiEntries.find((e) => e.id === selectedId) ?? null,
    [wikiEntries, selectedId],
  )

  // ----- 选中词条变化时同步编辑状态 -----
  useEffect(() => {
    if (selectedEntry) {
      setEditingName(selectedEntry.name)
      setEditingType(selectedEntry.type)
      setEditingAliases(selectedEntry.aliases.join(', '))
      setEditingTags(selectedEntry.tags.join(', '))
      setEditingContent(selectedEntry.content)
    }
  }, [selectedEntry])

  // ----- 搜索过滤 -----
  const keyword = searchText.trim().toLowerCase()
  const filteredEntries = useMemo(() => {
    if (!keyword) return wikiEntries
    return wikiEntries.filter(
      (e) =>
        e.name.toLowerCase().includes(keyword) ||
        e.aliases.some((a) => a.toLowerCase().includes(keyword)) ||
        e.tags.some((t) => t.toLowerCase().includes(keyword)),
    )
  }, [wikiEntries, keyword])

  // ----- 按类型分组 -----
  const grouped = useMemo(() => {
    const map = new Map<WikiType, WikiEntry[]>()
    for (const type of TYPE_ORDER) {
      map.set(type, [])
    }
    for (const entry of filteredEntries) {
      const arr = map.get(entry.type)
      if (arr) arr.push(entry)
    }
    return map
  }, [filteredEntries])

  // ----- 统计 -----
  const typeCounts = useMemo(() => {
    const counts = {} as Record<WikiType, number>
    for (const type of TYPE_ORDER) counts[type] = 0
    for (const e of wikiEntries) counts[e.type]++
    return counts
  }, [wikiEntries])

  // ----- 折叠切换 -----
  const toggleGroup = useCallback((type: WikiType) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }, [])

  // ----- 添加词条 -----
  const handleAdd = useCallback(async () => {
    const id = await createWikiEntry({ name: '新词条', type: 'concept' })
    setSelectedId(id)
  }, [createWikiEntry])

  // ----- 选择词条 -----
  const handleSelect = useCallback((id: string) => {
    setSelectedId(id)
  }, [])

  // ----- 保存 -----
  const handleSave = useCallback(async () => {
    if (!selectedId) return
    await updateWikiEntry(selectedId, {
      name: editingName || '未命名',
      type: editingType,
      aliases: editingAliases
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      tags: editingTags
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      content: editingContent,
    })
  }, [selectedId, editingName, editingType, editingAliases, editingTags, editingContent, updateWikiEntry])

  // ----- 删除 -----
  const handleDelete = useCallback(() => {
    if (!selectedId) return
    const entry = wikiEntries.find((e) => e.id === selectedId)
    const confirmed = confirm(`确定删除词条「${entry?.name ?? ''}」吗？此操作不可撤销。`)
    if (!confirmed) return
    deleteWikiEntry(selectedId)
    setSelectedId(null)
  }, [selectedId, wikiEntries, deleteWikiEntry])

  // =======================================================================
  // 渲染
  // =======================================================================

  // --- 左侧空状态 ---
  const isEmpty = wikiEntries.length === 0

  const sidebarContent = isEmpty ? (
    <div style={emptyList}>
      <div style={emptyListTitle}>暂无百科词条</div>
      <div style={emptyListHint}>点击上方「添加词条」创建第一个世界观词条</div>
    </div>
  ) : (
    <div style={listContainer}>
      {TYPE_ORDER.map((type) => {
        const entries = grouped.get(type) ?? []
        if (entries.length === 0) return null
        const meta = TYPE_META[type]
        const collapsed = collapsedGroups.has(type)

        return (
          <div key={type}>
            {/* 分组标题 */}
            <div
              style={groupHeader}
              onClick={() => toggleGroup(type)}
            >
              <span
                style={{
                  ...chevron,
                  transform: collapsed ? 'rotate(-90deg)' : 'rotate(0)',
                }}
              >
                &#9660;
              </span>
              <span style={{ ...entryDot, background: meta.color }} />
              {meta.label}
              <span style={groupCount}>{entries.length}</span>
            </div>

            {/* 词条列表 */}
            {!collapsed &&
              entries.map((entry) => {
                const isSelected = entry.id === selectedId
                return (
                  <div
                    key={entry.id}
                    style={{
                      ...entryItem,
                      background: isSelected ? 'var(--accent-soft)' : undefined,
                      color: isSelected ? 'var(--accent)' : undefined,
                      fontWeight: isSelected ? 600 : undefined,
                    }}
                    onClick={() => handleSelect(entry.id)}
                  >
                    <span style={{ ...entryDot, background: meta.color }} />
                    <span style={entryName}>{entry.name}</span>
                    <span style={typeTag}>{meta.label}</span>
                  </div>
                )
              })}
          </div>
        )
      })}
    </div>
  )

  // --- 右侧详情 ---
  let detailContent: React.ReactNode

  if (!selectedEntry) {
    detailContent = (
      <div style={emptyDetail}>
        {isEmpty ? '创建词条以开始构建世界观' : '选择一个词条查看详情'}
      </div>
    )
  } else {
    const meta = TYPE_META[selectedEntry.type]

    detailContent = (
      <>
        {/* 头部 */}
        <div style={detailHeader}>
          <div style={detailTitle}>{selectedEntry.name}</div>
          <div style={detailMeta}>
            <span
              style={{
                ...statsDot,
                background: meta.color,
                verticalAlign: 'middle',
              }}
            />
            {meta.label}
            {' · '}
            更新于 {new Date(selectedEntry.updatedAt).toLocaleString('zh-CN')}
          </div>
        </div>

        {/* 表单 */}
        <div style={detailBody}>
          {/* 名称 */}
          <div>
            <div style={fieldLabel}>名称</div>
            <input
              style={textInput}
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              placeholder="词条名称"
            />
          </div>

          {/* 类型 */}
          <div>
            <div style={fieldLabel}>类型</div>
            <select
              style={selectInput}
              value={editingType}
              onChange={(e) => setEditingType(e.target.value as WikiType)}
            >
              {TYPE_ORDER.map((t) => (
                <option key={t} value={t}>
                  {TYPE_META[t].label}
                </option>
              ))}
            </select>
          </div>

          {/* 别名 */}
          <div>
            <div style={fieldLabel}>别名（逗号分隔）</div>
            <input
              style={textInput}
              value={editingAliases}
              onChange={(e) => setEditingAliases(e.target.value)}
              placeholder="如: 外号, 英文名"
            />
          </div>

          {/* 标签 */}
          <div>
            <div style={fieldLabel}>标签（逗号分隔）</div>
            <input
              style={textInput}
              value={editingTags}
              onChange={(e) => setEditingTags(e.target.value)}
              placeholder="如: 重要, 第一幕"
            />
          </div>

          {/* 内容 */}
          <div>
            <div style={fieldLabel}>内容</div>
            <textarea
              style={textArea}
              value={editingContent}
              onChange={(e) => setEditingContent(e.target.value)}
              placeholder="输入词条的详细描述…"
            />
          </div>
        </div>

        {/* 底部操作 */}
        <div style={detailFooter}>
          <button style={deleteBtn} onClick={handleDelete}>
            删除词条
          </button>
          <button style={saveBtn} onClick={handleSave}>
            保存
          </button>
        </div>
      </>
    )
  }

  return (
    <div style={root} className="wiki-root">
      {/* 左侧列表 */}
      <div style={sidebar} className="wiki-sidebar">
        <div style={sidebarHeader}>
          {/* 统计 */}
          <div style={statsBar}>
            <span>共 {wikiEntries.length} 个词条</span>
            {TYPE_ORDER.map((type) => {
              const cnt = typeCounts[type]
              if (cnt === 0) return null
              return (
                <span key={type} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                  <span style={{ ...statsDot, background: TYPE_META[type].color }} />
                  {TYPE_META[type].label} {cnt}
                </span>
              )
            })}
          </div>

          {/* 搜索 + 添加 */}
          <div style={searchRow}>
            <input
              style={searchInput}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="搜索词条…"
            />
            <button style={addBtn} onClick={handleAdd}>
              + 添加
            </button>
          </div>
        </div>

        {sidebarContent}
      </div>

      {/* 右侧详情 */}
      <div style={detailPanel} className="wiki-detail-panel">
        {detailContent}
      </div>
    </div>
  )
}
