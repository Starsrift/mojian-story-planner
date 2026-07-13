import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Handle,
  Position,
  BackgroundVariant,
  MarkerType,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
  type NodeProps,
  type ReactFlowInstance,
} from '@xyflow/react'
import { useStore } from '../store/useStore'
import {
  useCallback,
  useMemo,
  useState,
  useEffect,
  useRef,
  memo,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import type { StoryCard } from '../types'

/* ------------------------------------------------------------------ *
 * 类型定义
 * ------------------------------------------------------------------ */

type StoryCardNodeData = { card: StoryCard }
type StoryCardNodeType = Node<StoryCardNodeData, 'storyCard'>

/* ------------------------------------------------------------------ *
 * 常量
 * ------------------------------------------------------------------ */

/** 颜色预设 —— 与整体纸质 / 暖色调主题一致 */
const COLOR_PRESETS = [
  '#8b5e3c', // 棕褐
  '#c4683f', // 赤陶
  '#5a7a4a', // 苔绿
  '#c08a3e', // 琥珀
  '#7a5c8e', // 雅紫
  '#3c6e8b', // 钢蓝
  '#a05050', // 绛红
  '#5e7a5a', // 鼠尾草
]

/* ------------------------------------------------------------------ *
 * 自定义节点组件
 * ------------------------------------------------------------------ */

const StoryCardNode = memo(function StoryCardNode({
  data,
  id,
}: NodeProps<StoryCardNodeType>) {
  const card = data.card
  const isSelected = useStore((s) => s.selectedCardId === id)

  const summaryPreview = useMemo(() => {
    if (!card.summary) return '暂无摘要'
    return card.summary.length > 30
      ? card.summary.slice(0, 30) + '…'
      : card.summary
  }, [card.summary])

  return (
    <div
      style={{
        width: 220,
        background: 'var(--bg-panel)',
        border: isSelected
          ? '2px solid var(--accent)'
          : '1px solid var(--rule)',
        borderRadius: 'var(--radius)',
        boxShadow: isSelected ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'border-color 160ms ease, box-shadow 160ms ease',
      }}
    >
      <div style={{ display: 'flex', minHeight: 64 }}>
        {/* 左侧色条 */}
        <div
          style={{
            width: 5,
            flexShrink: 0,
            background: card.color || 'var(--accent)',
          }}
        />
        {/* 内容区 */}
        <div style={{ flex: 1, padding: '10px 12px', minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: 6,
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: '1px 6px',
                borderRadius: 'var(--radius-pill)',
                background: 'var(--accent-soft)',
                color: 'var(--accent)',
                flexShrink: 0,
                whiteSpace: 'nowrap',
              }}
            >
              第{card.act}幕
            </span>
            <span
              style={{
                fontSize: 'var(--fs-md)',
                fontWeight: 600,
                color: 'var(--ink)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {card.title || '未命名'}
            </span>
          </div>
          <div
            style={{
              fontSize: 'var(--fs-sm)',
              color: 'var(--muted)',
              lineHeight: 1.5,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {summaryPreview}
          </div>
        </div>
      </div>

      <Handle
        type="target"
        position={Position.Left}
        style={{
          background: 'var(--accent)',
          width: 8,
          height: 8,
          border: 'none',
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{
          background: 'var(--accent)',
          width: 8,
          height: 8,
          border: 'none',
        }}
      />
    </div>
  )
})

/* ------------------------------------------------------------------ *
 * 卡片详情侧边栏
 * ------------------------------------------------------------------ */

function CardDetailSidebar() {
  const card = useStore((s) =>
    s.storyCards.find((c) => c.id === s.selectedCardId)
  )
  const updateStoryCard = useStore((s) => s.updateStoryCard)
  const deleteStoryCard = useStore((s) => s.deleteStoryCard)
  const selectCard = useStore((s) => s.selectCard)

  if (!card) return null

  const handleDelete = () => {
    if (!window.confirm(`确定删除章节「${card.title}」吗？相关情节连线也会一并删除。`)) return
    deleteStoryCard(card.id)
  }

  return (
    <div
      className="canvas-detail-panel"
      style={{
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: 300,
        background: 'var(--bg-panel)',
        borderLeft: '1px solid var(--rule)',
        boxShadow: 'var(--shadow-lg)',
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* 头部 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--rule)',
          flexShrink: 0,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 'var(--fs-lg)' }}>
          卡片详情
        </span>
        <button
          className="icon-btn"
          onClick={() => selectCard(null)}
          title="关闭"
        >
          ✕
        </button>
      </div>

      {/* 表单区 —— 可滚动 */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {/* 标题 */}
        <div>
          <label className="form-label">标题</label>
          <input
            className="form-input"
            type="text"
            value={card.title}
            onChange={(e) =>
              updateStoryCard(card.id, { title: e.target.value })
            }
            placeholder="章节标题"
          />
        </div>

        {/* 幕号 */}
        <div>
          <label className="form-label">幕号</label>
          <select
            className="form-select"
            value={card.act}
            onChange={(e) =>
              updateStoryCard(card.id, { act: Number(e.target.value) })
            }
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                第{n}幕
              </option>
            ))}
          </select>
        </div>

        {/* 摘要 */}
        <div>
          <label className="form-label">摘要</label>
          <textarea
            className="form-textarea"
            value={card.summary}
            onChange={(e) =>
              updateStoryCard(card.id, { summary: e.target.value })
            }
            placeholder="章节摘要..."
            rows={4}
          />
        </div>

        {/* 关键情节 */}
        <div>
          <label className="form-label">
            关键情节 <span style={{ color: 'var(--muted)' }}>(每行一条)</span>
          </label>
          <textarea
            className="form-textarea"
            value={card.keyPoints}
            onChange={(e) =>
              updateStoryCard(card.id, { keyPoints: e.target.value })
            }
            placeholder="关键情节..."
            rows={4}
          />
        </div>

        {/* 备注 */}
        <div>
          <label className="form-label">备注</label>
          <textarea
            className="form-textarea"
            value={card.notes}
            onChange={(e) =>
              updateStoryCard(card.id, { notes: e.target.value })
            }
            placeholder="备注 / 灵感片段..."
            rows={3}
          />
        </div>

        {/* 颜色 */}
        <div>
          <label className="form-label">颜色</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {COLOR_PRESETS.map((color) => (
              <button
                key={color}
                onClick={() => updateStoryCard(card.id, { color })}
                aria-label={`选择卡片颜色 ${color}`}
                title={color}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: color,
                  border:
                    card.color === color
                      ? '2px solid var(--ink)'
                      : '2px solid transparent',
                  cursor: 'pointer',
                  transition: 'border-color 160ms ease',
                  padding: 0,
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* 底部操作栏 */}
      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--rule)',
          flexShrink: 0,
        }}
      >
        <button
          className="btn btn-danger"
          style={{ width: '100%' }}
          onClick={handleDelete}
        >
          删除卡片
        </button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * 主组件
 * ------------------------------------------------------------------ */

export function StoryBoard() {
  // ---- 从 store 获取数据与操作 ----
  const storyCards = useStore((s) => s.storyCards)
  const storyLinks = useStore((s) => s.storyLinks)
  const selectedCardId = useStore((s) => s.selectedCardId)
  const createStoryCard = useStore((s) => s.createStoryCard)
  const updateStoryCard = useStore((s) => s.updateStoryCard)
  const deleteStoryCard = useStore((s) => s.deleteStoryCard)
  const createStoryLink = useStore((s) => s.createStoryLink)
  const deleteStoryLink = useStore((s) => s.deleteStoryLink)
  const selectCard = useStore((s) => s.selectCard)

  // ---- Refs ----
  const flowInstanceRef = useRef<ReactFlowInstance<StoryCardNodeType, Edge> | null>(null)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingPositionsRef = useRef<
    Map<string, { x: number; y: number }>
  >(new Map())

  // ---- 节点类型 (memoize 避免每次渲染重建) ----
  const nodeTypes = useMemo(() => ({ storyCard: StoryCardNode }), [])

  // ---- 从 store 数据派生 nodes / edges (useMemo 缓存) ----
  const storeNodes = useMemo<StoryCardNodeType[]>(
    () =>
      storyCards.map((card) => ({
        id: card.id,
        type: 'storyCard',
        position: card.position,
        data: { card },
      })),
    [storyCards]
  )

  const storeEdges = useMemo<Edge[]>(
    () =>
      storyLinks.map((link) => ({
        id: link.id,
        source: link.source,
        target: link.target,
        label: link.label || undefined,
        type: 'smoothstep',
        animated: false,
        markerEnd: { type: MarkerType.ArrowClosed },
        labelStyle: { fontSize: 11, fill: 'var(--ink)' },
        labelShowBg: true,
        labelBgStyle: { fill: 'var(--bg-panel)' },
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 4,
      })),
    [storyLinks]
  )

  // ---- ReactFlow 本地状态 ----
  const [nodes, setNodes, onNodesChangeDefault] =
    useNodesState<StoryCardNodeType>(storeNodes)
  const [edges, setEdges, onEdgesChangeDefault] = useEdgesState(storeEdges)

  // ---- store -> 本地同步 ----
  // 保留已有节点的本地 position (拖拽过程中可能领先于 store),
  // 仅对新增节点使用 store 中的 position
  useEffect(() => {
    setNodes((prev) => {
      const prevMap = new Map(prev.map((n) => [n.id, n]))
      return storeNodes.map((n) => {
        const existing = prevMap.get(n.id)
        if (existing) {
          return { ...n, position: existing.position }
        }
        return n
      })
    })
  }, [storeNodes, setNodes])

  useEffect(() => {
    setEdges(storeEdges)
  }, [storeEdges, setEdges])

  // ---- 卸载时清理 debounce 定时器 ----
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  // ---- onNodesChange: 本地应用 + 位置 debounce 存 DB + 删除同步 ----
  const onNodesChange = useCallback(
    (changes: NodeChange<StoryCardNodeType>[]) => {
      onNodesChangeDefault(changes)

      // 位置变更 —— 累积后 debounce 写入
      const positionChanges = changes.filter(
        (c): c is Extract<NodeChange<StoryCardNodeType>, { type: 'position' }> =>
          c.type === 'position' && c.position != null
      )
      if (positionChanges.length > 0) {
        positionChanges.forEach((c) => {
          pendingPositionsRef.current.set(c.id, c.position!)
        })
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current)
        }
        debounceTimerRef.current = setTimeout(() => {
          pendingPositionsRef.current.forEach((position, id) => {
            updateStoryCard(id, { position })
          })
          pendingPositionsRef.current.clear()
          debounceTimerRef.current = null
        }, 400)
      }

      // 节点删除 —— 立即同步到 store
      changes
        .filter((c): c is Extract<NodeChange<StoryCardNodeType>, { type: 'remove' }> => c.type === 'remove')
        .forEach((c) => deleteStoryCard(c.id))
    },
    [onNodesChangeDefault, updateStoryCard, deleteStoryCard]
  )

  // ---- onEdgesChange: 本地应用 + 删除同步 ----
  const onEdgesChange = useCallback(
    (changes: EdgeChange<Edge>[]) => {
      onEdgesChangeDefault(changes)

      changes
        .filter((c): c is Extract<EdgeChange<Edge>, { type: 'remove' }> => c.type === 'remove')
        .forEach((c) => deleteStoryLink(c.id))
    },
    [onEdgesChangeDefault, deleteStoryLink]
  )

  // ---- onConnect: 创建连线 ----
  const onConnect = useCallback(
    (connection: Connection) => {
      if (
        connection.source &&
        connection.target &&
        connection.source !== connection.target
      ) {
        createStoryLink(connection.source, connection.target)
      }
    },
    [createStoryLink]
  )

  // ---- 点击节点选中 ----
  const onNodeClick = useCallback(
    (_event: ReactMouseEvent, node: StoryCardNodeType) => {
      selectCard(node.id)
    },
    [selectCard]
  )

  // ---- 点击画布空白处取消选中 ----
  const onPaneClick = useCallback(() => {
    selectCard(null)
  }, [selectCard])

  // ---- 保存 ReactFlow 实例 ----
  const onInit = useCallback(
    (instance: ReactFlowInstance<StoryCardNodeType, Edge>) => {
      flowInstanceRef.current = instance
    },
    []
  )

  // ---- 双击画布空白处创建卡片 ----
  const onDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement
      if (target.classList.contains('react-flow__pane')) {
        const position = flowInstanceRef.current?.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        })
        if (position) {
          createStoryCard({ position })
        }
      }
    },
    [createStoryCard]
  )

  // ---- 右下角按钮创建卡片 ----
  const handleAddCard = useCallback(() => {
    createStoryCard({})
  }, [createStoryCard])

  const isEmpty = storyCards.length === 0

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onInit={onInit}
        onDoubleClick={onDoubleClick}
        nodeTypes={nodeTypes}
        zoomOnDoubleClick={false}
        deleteKeyCode={['Backspace', 'Delete']}
        fitView
        fitViewOptions={{ maxZoom: 1 }}
        style={{ width: '100%', height: '100%' }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="var(--rule)"
        />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            const data = node.data as StoryCardNodeData | undefined
            return data?.card?.color || '#8b5e3c'
          }}
          nodeStrokeWidth={2}
          style={{
            background: 'var(--bg-panel)',
            border: '1px solid var(--rule)',
          }}
          maskColor="rgba(0, 0, 0, 0.05)"
        />
      </ReactFlow>

      {/* 空状态提示 */}
      {isEmpty && (
        <div className="canvas-empty-state">
          <span className="canvas-empty-step">第一步 · 故事骨架</span>
          <h2>从第一个关键章节开始</h2>
          <p>添加章节卡片，拖动安排位置，再用连线表达情节推进与因果关系。</p>
          <button className="btn btn-primary" onClick={handleAddCard}>＋ 添加首个章节</button>
          <small>也可以双击画布任意空白位置快速创建</small>
        </div>
      )}

      {/* 浮动添加按钮 */}
      <button
        onClick={handleAddCard}
        style={{
          position: 'absolute',
          bottom: 20,
          right: selectedCardId ? 320 : 20,
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: 'var(--accent)',
          color: 'var(--accent-ink)',
          fontSize: 24,
          fontWeight: 300,
          border: 'none',
          boxShadow: 'var(--shadow-md)',
          cursor: 'pointer',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'right 160ms ease, background 160ms ease',
          lineHeight: 1,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--accent2)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'var(--accent)'
        }}
        title="添加章节卡片"
      >
        +
      </button>

      {/* 卡片详情侧边栏 */}
      {selectedCardId && <CardDetailSidebar />}
    </div>
  )
}
