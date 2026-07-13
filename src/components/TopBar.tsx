import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { isDesktopRuntime, storage, type StorageStatus } from '../db/storage'
import { describeStorageStatus } from '../db/storageStatus'
import { useStore } from '../store/useStore'

type ViewMode = 'structure' | 'characters' | 'timeline' | 'foreshadow' | 'wiki'

const VIEWS: { mode: ViewMode; label: string; short: string }[] = [
  { mode: 'structure', label: '故事结构', short: '结构板' },
  { mode: 'characters', label: '人物关系', short: '人物图' },
  { mode: 'timeline', label: '故事时间线', short: '时间线' },
  { mode: 'foreshadow', label: '伏笔追踪', short: '伏笔表' },
  { mode: 'wiki', label: '世界观百科', short: '百科' },
]

/**
 * 顶栏
 *
 * - 左侧: "墨笺" logo + 当前作品名 (下拉切换)
 * - 中间: 视图切换按钮组, 当前 viewMode 高亮 (accent 底部边框)
 * - 右侧: 主题切换按钮 (切换 documentElement 上的 data-theme)
 */
export function TopBar() {
  const projects = useStore((s) => s.projects)
  const currentProjectId = useStore((s) => s.currentProjectId)
  const viewMode = useStore((s) => s.viewMode)
  const setViewMode = useStore((s) => s.setViewMode)
  const selectProject = useStore((s) => s.selectProject)
  const deleteProject = useStore((s) => s.deleteProject)
  const leaveProject = useStore((s) => s.leaveProject)
  const storyCards = useStore((s) => s.storyCards)
  const storyLinks = useStore((s) => s.storyLinks)
  const characters = useStore((s) => s.characters)
  const relations = useStore((s) => s.relations)
  const timelineEvents = useStore((s) => s.timelineEvents)
  const foreshadows = useStore((s) => s.foreshadows)
  const wikiEntries = useStore((s) => s.wikiEntries)

  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [exported, setExported] = useState(false)
  const [storageStatus, setStorageStatus] = useState<StorageStatus>(() => ({
    backend: isDesktopRuntime() ? 'sqlite' : 'indexeddb',
  }))
  const [storageStatusError, setStorageStatusError] = useState<string | null>(null)
  const persistenceStatus = useSyncExternalStore(
    storage.subscribePersistenceStatus,
    storage.getPersistenceStatus,
    storage.getPersistenceStatus,
  )
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('mojian-theme')
    if (saved === 'light' || saved === 'dark') return saved
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  const switcherRef = useRef<HTMLDivElement>(null)

  const current = projects.find((p) => p.id === currentProjectId)

  // 点击外部关闭下拉
  useEffect(() => {
    if (!dropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [dropdownOpen])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('mojian-theme', theme)
  }, [theme])

  useEffect(() => {
    let active = true
    storage.getStorageStatus().then((status) => {
      if (active) {
        setStorageStatus(status)
        setStorageStatusError(null)
      }
    }).catch((error) => {
      if (active) {
        setStorageStatusError(error instanceof Error ? error.message : String(error))
      }
    })
    return () => {
      active = false
    }
  }, [])

  const storageDescription = storageStatusError
    ? { label: '存储状态异常', title: `读取本地存储状态失败：${storageStatusError}` }
    : describeStorageStatus(storageStatus, persistenceStatus)

  const handleSelect = (id: string) => {
    setDropdownOpen(false)
    if (id !== currentProjectId) {
      selectProject(id)
    }
  }

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
  }

  const handleExport = () => {
    if (!current) return
    const backup = {
      format: 'mojian-project',
      version: 1,
      exportedAt: new Date().toISOString(),
      project: current,
      data: { storyCards, storyLinks, characters, relations, timelineEvents, foreshadows, wikiEntries },
    }
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${current.name.replace(/[\\/:*?"<>|]/g, '-')}-墨笺备份.json`
    link.click()
    URL.revokeObjectURL(url)
    setExported(true)
    window.setTimeout(() => setExported(false), 1800)
  }

  const handleDelete = async () => {
    if (!current) return
    if (!window.confirm(`确定删除作品「${current.name}」吗？所有策划数据都会被永久删除。`)) return
    setDropdownOpen(false)
    await deleteProject(current.id)
  }

  return (
    <div className="topbar">
      {/* 左侧: logo + 作品切换 */}
      <div className="topbar-left">
        <button className="brand brand-button" onClick={leaveProject} title="返回作品首页">
          墨笺
        </button>
        <div className="project-switcher" ref={switcherRef}>
          <button
            className="current-project"
            onClick={() => setDropdownOpen((v) => !v)}
            title="切换作品"
            aria-expanded={dropdownOpen}
            aria-haspopup="menu"
          >
            <span className="current-project-name">{current?.name || '未选择作品'}</span>
            <span aria-hidden="true" style={{ opacity: 0.6 }}>▾</span>
          </button>
          {dropdownOpen && (
            <div className="dropdown project-menu" role="menu">
              <div className="dropdown-label">切换作品</div>
              {projects.length === 0 && (
                <div className="dropdown-item" style={{ color: 'var(--muted)' }}>
                  暂无作品
                </div>
              )}
              {projects.map((p) => (
                <button
                  key={p.id}
                  className={`dropdown-item ${p.id === currentProjectId ? 'active' : ''}`}
                  onClick={() => handleSelect(p.id)}
                  role="menuitem"
                >
                  <span className="text-truncate">{p.name}</span>
                  {p.id === currentProjectId && <span aria-hidden="true">✓</span>}
                </button>
              ))}
              <div className="dropdown-divider" />
              <button className="dropdown-item" onClick={leaveProject} role="menuitem">
                <span>＋ 新建或管理作品</span>
              </button>
              <button className="dropdown-item" onClick={handleExport} role="menuitem">
                <span>↓ 导出当前作品备份</span>
              </button>
              <button className="dropdown-item danger-item" onClick={handleDelete} role="menuitem">
                <span>删除当前作品</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 中间: 视图切换 */}
      <div className="topbar-center">
        {VIEWS.map((v) => (
          <button
            key={v.mode}
            className={`view-btn ${viewMode === v.mode ? 'active' : ''}`}
            onClick={() => setViewMode(v.mode)}
            aria-label={v.label}
            aria-pressed={viewMode === v.mode}
          >
            {v.short}
          </button>
        ))}
      </div>

      {/* 右侧: 主题切换 */}
      <div className="topbar-right">
        <div
          className={`save-status save-status-${storageStatusError ? 'error' : persistenceStatus.phase}`}
          title={storageDescription.title}
          role="status"
          aria-live="polite"
        >
          <span className="save-status-dot" />
          {storageDescription.label}
        </div>
        <button className="theme-btn" onClick={toggleTheme} title="切换明暗主题" aria-label="切换明暗主题">
          <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
        </button>
      </div>
      {exported && <div className="topbar-toast" role="status" aria-live="polite">备份已导出</div>}
    </div>
  )
}
