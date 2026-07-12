import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
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
import type { Character } from '../types'

/* ------------------------------------------------------------------ *
 * 类型定义
 * ------------------------------------------------------------------ */

type CharacterNodeData = { character: Character }
type CharacterNodeType = Node<CharacterNodeData, 'character'>

/* ------------------------------------------------------------------ *
 * 常量
 * ------------------------------------------------------------------ */

/** 关系类型 → 颜色映射 */
const RELATION_COLORS: Record<string, string> = {
  '亲属': '#e74c3c',
  '敌对': '#c0392b',
  '盟友': '#27ae60',
  '暗恋': '#e84393',
  '师徒': '#2d6cdf',
  '其他': '#7f8c8d',
}

/** 关系类型选项(用于连线选择器) */
const RELATION_TYPES = Object.keys(RELATION_COLORS)

/** 角色类型选项 */
const ROLE_OPTIONS = ['主角', '女主角', '男主角', '配角', '反派', '路人']

/** 颜色预设 */
const COLOR_PRESETS = [
  '#c4683f',
  '#8b5e3c',
  '#5a7a4a',
  '#c08a3e',
  '#7a5c8e',
  '#3c6e8b',
  '#a05050',
  '#e74c3c',
  '#e84393',
  '#2d6cdf',
]

/* ------------------------------------------------------------------ *
 * 自定义节点组件 CharacterNode
 * ------------------------------------------------------------------ */

const CharacterNode = memo(function CharacterNode({
  data,
  id,
}: NodeProps<CharacterNodeType>) {
  const character = data.character
  const isSelected = useStore((s) => s.selectedCharacterId === id)
  const initial = character.name ? character.name[0] : '?'

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        background: 'var(--bg-panel)',
        border: isSelected
          ? '2px solid var(--accent)'
          : '1px solid var(--rule)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: isSelected ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        padding: '12px 16px 10px',
        cursor: 'pointer',
        transition: 'border-color 160ms ease, box-shadow 160ms ease',
        minWidth: 80,
      }}
    >
      {/* 圆形头像 */}
      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: '50%',
          background: character.color || 'var(--accent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontSize: 18,
          fontWeight: 600,
          marginBottom: 6,
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          flexShrink: 0,
        }}
      >
        {initial}
      </div>

      {/* 角色名 */}
      <div
        style={{
          fontSize: 'var(--fs-md)',
          fontWeight: 600,
          color: 'var(--ink)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: 80,
          textAlign: 'center',
          lineHeight: 1.3,
        }}
      >
        {character.name || '未命名'}
      </div>

      {/* 角色类型标签 */}
      <div
        style={{
          fontSize: 'var(--fs-xs)',
          padding: '1px 6px',
          borderRadius: 'var(--radius-pill)',
          background: 'var(--accent-soft)',
          color: 'var(--accent)',
          marginTop: 4,
          flexShrink: 0,
          whiteSpace: 'nowrap',
        }}
      >
        {character.role || '配角'}
      </div>

      {/* 四个方向的 Handle */}
      <Handle
        type="target"
        position={Position.Top}
        id="target-top"
        style={{ background: 'var(--accent)', width: 8, height: 8, border: 'none' }}
      />
      <Handle
        type="source"
        position={Position.Top}
        id="source-top"
        style={{ background: 'var(--accent)', width: 8, height: 8, border: 'none', top: -1 }}
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="target-bottom"
        style={{ background: 'var(--accent)', width: 8, height: 8, border: 'none' }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="source-bottom"
        style={{ background: 'var(--accent)', width: 8, height: 8, border: 'none', bottom: -1 }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="target-left"
        style={{ background: 'var(--accent)', width: 8, height: 8, border: 'none' }}
      />
      <Handle
        type="source"
        position={Position.Left}
        id="source-left"
        style={{ background: 'var(--accent)', width: 8, height: 8, border: 'none', left: -1 }}
      />
      <Handle
        type="target"
        position={Position.Right}
        id="target-right"
        style={{ background: 'var(--accent)', width: 8, height: 8, border: 'none' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="source-right"
        style={{ background: 'var(--accent)', width: 8, height: 8, border: 'none', right: -1 }}
      />
    </div>
  )
})

/* ------------------------------------------------------------------ *
 * 关系类型选择器(固定定位浮层)
 * ------------------------------------------------------------------ */

function RelationTypePicker({
  onPick,
  onClose,
}: {
  onPick: (type: string) => void
  onClose: () => void
}) {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 80,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 100,
        background: 'var(--bg-panel)',
        border: '1px solid var(--rule)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-lg)',
        padding: '10px 14px',
        display: 'flex',
        gap: 6,
        alignItems: 'center',
        flexWrap: 'wrap',
        maxWidth: 400,
        animation: 'modal-panel-in 180ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
      }}
    >
      <span
        style={{
          fontSize: 'var(--fs-sm)',
          color: 'var(--muted)',
          marginRight: 4,
          fontWeight: 500,
        }}
      >
        选择关系:
      </span>
      {RELATION_TYPES.map((type) => (
        <button
          key={type}
          className="btn"
          onClick={() => onPick(type)}
          style={{
            fontSize: 'var(--fs-sm)',
            padding: '4px 10px',
            border: `1px solid ${RELATION_COLORS[type]}`,
            color: RELATION_COLORS[type],
            borderRadius: 'var(--radius-pill)',
          }}
        >
          {type}
        </button>
      ))}
      <button
        className="icon-btn"
        onClick={onClose}
        title="取消"
        style={{ marginLeft: 4 }}
      >
        ✕
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * 角色详情侧边栏
 * ------------------------------------------------------------------ */

function CharacterDetailSidebar() {
  const character = useStore((s) =>
    s.characters.find((c) => c.id === s.selectedCharacterId)
  )
  const updateCharacter = useStore((s) => s.updateCharacter)
  const deleteCharacter = useStore((s) => s.deleteCharacter)
  const selectCharacter = useStore((s) => s.selectCharacter)

  // 本地表单状态
  const [name, setName] = useState('')
  const [aliases, setAliases] = useState('')
  const [role, setRole] = useState('配角')
  const [description, setDescription] = useState('')
  const [personality, setPersonality] = useState('')
  const [background, setBackground] = useState('')
  const [color, setColor] = useState('#c4683f')
  const initializedRef = useRef(false)

  // 从 store 数据初始化本地状态
  useEffect(() => {
    if (character) {
      setName(character.name)
      setAliases(character.aliases.join(', '))
      setRole(character.role)
      setDescription(character.description)
      setPersonality(character.personality)
      setBackground(character.background)
      setColor(character.color)
      initializedRef.current = true
    } else {
      initializedRef.current = false
    }
  }, [character?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // 本地状态变更 → debounce 写入 store
  const patchRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flushPatch = useCallback(
    (patch: Partial<Character>) => {
      if (!character) return
      if (patchRef.current) clearTimeout(patchRef.current)
      patchRef.current = setTimeout(() => {
        updateCharacter(character.id, patch)
        patchRef.current = null
      }, 400)
    },
    [character, updateCharacter]
  )

  // 清理
  useEffect(() => {
    return () => {
      if (patchRef.current) clearTimeout(patchRef.current)
    }
  }, [])

  if (!character) return null

  const handleNameChange = (val: string) => {
    setName(val)
    flushPatch({ name: val })
  }

  const handleAliasesChange = (val: string) => {
    setAliases(val)
    flushPatch({ aliases: val.split(',').map((s) => s.trim()).filter(Boolean) })
  }

  const handleRoleChange = (val: string) => {
    setRole(val)
    flushPatch({ role: val })
  }

  const handleDescriptionChange = (val: string) => {
    setDescription(val)
    flushPatch({ description: val })
  }

  const handlePersonalityChange = (val: string) => {
    setPersonality(val)
    flushPatch({ personality: val })
  }

  const handleBackgroundChange = (val: string) => {
    setBackground(val)
    flushPatch({ background: val })
  }

  const handleColorChange = (val: string) => {
    setColor(val)
    flushPatch({ color: val })
  }

  const handleDelete = () => {
    if (!window.confirm(`确定删除角色「${character.name}」吗？相关人物关系也会一并删除。`)) return
    deleteCharacter(character.id)
    selectCharacter(null)
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
          角色详情
        </span>
        <button
          className="icon-btn"
          onClick={() => selectCharacter(null)}
          title="关闭"
        >
          ✕
        </button>
      </div>

      {/* 表单区 */}
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
        {/* 姓名 */}
        <div>
          <label className="form-label">姓名</label>
          <input
            className="form-input"
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="角色姓名"
          />
        </div>

        {/* 别名 */}
        <div>
          <label className="form-label">别名</label>
          <input
            className="form-input"
            type="text"
            value={aliases}
            onChange={(e) => handleAliasesChange(e.target.value)}
            placeholder="用逗号分隔多个别名"
          />
        </div>

        {/* 角色类型 */}
        <div>
          <label className="form-label">角色类型</label>
          <select
            className="form-select"
            value={role}
            onChange={(e) => handleRoleChange(e.target.value)}
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        {/* 简介 */}
        <div>
          <label className="form-label">简介</label>
          <textarea
            className="form-textarea"
            value={description}
            onChange={(e) => handleDescriptionChange(e.target.value)}
            placeholder="角色简介..."
            rows={3}
          />
        </div>

        {/* 性格 */}
        <div>
          <label className="form-label">性格</label>
          <textarea
            className="form-textarea"
            value={personality}
            onChange={(e) => handlePersonalityChange(e.target.value)}
            placeholder="性格特点..."
            rows={3}
          />
        </div>

        {/* 背景 */}
        <div>
          <label className="form-label">背景</label>
          <textarea
            className="form-textarea"
            value={background}
            onChange={(e) => handleBackgroundChange(e.target.value)}
            placeholder="角色背景故事..."
            rows={3}
          />
        </div>

        {/* 颜色 */}
        <div>
          <label className="form-label">颜色</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {COLOR_PRESETS.map((c) => (
              <button
                key={c}
                onClick={() => handleColorChange(c)}
                aria-label={`选择角色颜色 ${c}`}
                title={c}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: c,
                  border:
                    color === c
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
          删除角色
        </button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * 主组件 CharacterMap
 * ------------------------------------------------------------------ */

export function CharacterMap() {
  // ---- 从 store 获取数据与操作 ----
  const characters = useStore((s) => s.characters)
  const relations = useStore((s) => s.relations)
  const selectedCharacterId = useStore((s) => s.selectedCharacterId)
  const createCharacter = useStore((s) => s.createCharacter)
  const updateCharacter = useStore((s) => s.updateCharacter)
  const deleteCharacter = useStore((s) => s.deleteCharacter)
  const createRelation = useStore((s) => s.createRelation)
  const deleteRelation = useStore((s) => s.deleteRelation)
  const selectCharacter = useStore((s) => s.selectCharacter)

  // ---- 关系类型选择器状态 ----
  const [pendingConnection, setPendingConnection] =
    useState<Connection | null>(null)

  // ---- Refs ----
  const flowInstanceRef = useRef<ReactFlowInstance<CharacterNodeType, Edge> | null>(null)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingPositionsRef = useRef<
    Map<string, { x: number; y: number }>
  >(new Map())

  // ---- 节点类型 (memoize 避免每次渲染重建) ----
  const nodeTypes = useMemo(() => ({ character: CharacterNode }), [])

  // ---- 从 store 数据派生 nodes / edges ----
  const storeNodes = useMemo<CharacterNodeType[]>(
    () =>
      characters.map((char) => ({
        id: char.id,
        type: 'character',
        position: char.position,
        data: { character: char },
      })),
    [characters]
  )

  const storeEdges = useMemo<Edge[]>(
    () =>
      relations.map((rel) => {
        const relColor = RELATION_COLORS[rel.type] || RELATION_COLORS['其他']
        return {
          id: rel.id,
          source: rel.source,
          target: rel.target,
          label: rel.type,
          type: 'smoothstep',
          animated: false,
          markerEnd: { type: MarkerType.ArrowClosed },
          style: { stroke: relColor, strokeWidth: 2 },
          labelStyle: { fontSize: 11, fill: relColor, fontWeight: 500 },
          labelShowBg: true,
          labelBgStyle: { fill: 'var(--bg-panel)' },
          labelBgPadding: [4, 2] as [number, number],
          labelBgBorderRadius: 4,
        }
      }),
    [relations]
  )

  // ---- ReactFlow 本地状态 ----
  const [nodes, setNodes, onNodesChangeDefault] =
    useNodesState<CharacterNodeType>(storeNodes)
  const [edges, setEdges, onEdgesChangeDefault] = useEdgesState(storeEdges)

  // ---- store -> 本地同步 ----
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
    (changes: NodeChange<CharacterNodeType>[]) => {
      onNodesChangeDefault(changes)

      const positionChanges = changes.filter(
        (c): c is Extract<NodeChange<CharacterNodeType>, { type: 'position' }> =>
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
            updateCharacter(id, { position })
          })
          pendingPositionsRef.current.clear()
          debounceTimerRef.current = null
        }, 400)
      }

      changes
        .filter((c): c is Extract<NodeChange<CharacterNodeType>, { type: 'remove' }> => c.type === 'remove')
        .forEach((c) => deleteCharacter(c.id))
    },
    [onNodesChangeDefault, updateCharacter, deleteCharacter]
  )

  // ---- onEdgesChange: 本地应用 + 删除同步 ----
  const onEdgesChange = useCallback(
    (changes: EdgeChange<Edge>[]) => {
      onEdgesChangeDefault(changes)

      changes
        .filter((c): c is Extract<EdgeChange<Edge>, { type: 'remove' }> => c.type === 'remove')
        .forEach((c) => deleteRelation(c.id))
    },
    [onEdgesChangeDefault, deleteRelation]
  )

  // ---- onConnect: 弹出关系类型选择器 ----
  const onConnect = useCallback(
    (connection: Connection) => {
      if (
        connection.source &&
        connection.target &&
        connection.source !== connection.target
      ) {
        setPendingConnection(connection)
      }
    },
    []
  )

  // ---- 选择关系类型后创建关系 ----
  const handleRelationPick = useCallback(
    (type: string) => {
      if (pendingConnection?.source && pendingConnection?.target) {
        createRelation(pendingConnection.source, pendingConnection.target, type)
      }
      setPendingConnection(null)
    },
    [pendingConnection, createRelation]
  )

  // ---- 点击节点选中 ----
  const onNodeClick = useCallback(
    (_event: ReactMouseEvent, node: CharacterNodeType) => {
      selectCharacter(node.id)
    },
    [selectCharacter]
  )

  // ---- 点击画布空白处取消选中 ----
  const onPaneClick = useCallback(() => {
    selectCharacter(null)
    setPendingConnection(null)
  }, [selectCharacter])

  // ---- 保存 ReactFlow 实例 ----
  const onInit = useCallback(
    (instance: ReactFlowInstance<CharacterNodeType, Edge>) => {
      flowInstanceRef.current = instance
    },
    []
  )

  // ---- 右下角按钮创建角色 ----
  const handleAddCharacter = useCallback(() => {
    createCharacter({})
  }, [createCharacter])

  const isEmpty = characters.length === 0

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
        nodeTypes={nodeTypes}
        fitView
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
            const data = node.data as CharacterNodeData | undefined
            return data?.character?.color || '#c4683f'
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
          <span className="canvas-empty-step">第二步 · 人物网络</span>
          <h2>把故事中的人放进关系图</h2>
          <p>创建角色卡，补充身份与性格，再连接角色并标记亲属、盟友或敌对关系。</p>
          <button className="btn btn-primary" onClick={handleAddCharacter}>＋ 添加首个角色</button>
          <small>拖动卡片可以自由整理人物阵营</small>
        </div>
      )}

      {/* 浮动添加角色按钮 */}
      <button
        onClick={handleAddCharacter}
        style={{
          position: 'absolute',
          bottom: 20,
          right: selectedCharacterId ? 320 : 20,
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
        title="添加角色"
      >
        +
      </button>

      {/* 关系类型选择器 */}
      {pendingConnection && (
        <RelationTypePicker
          onPick={handleRelationPick}
          onClose={() => setPendingConnection(null)}
        />
      )}

      {/* 角色详情侧边栏 */}
      {selectedCharacterId && <CharacterDetailSidebar />}
    </div>
  )
}
