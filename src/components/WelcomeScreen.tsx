import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore'

/**
 * 欢迎界面
 *
 * - 居中展示 "墨笺" logo 与副标题
 * - 提供输入框创建新作品 (createProject -> selectProject)
 * - 若已有作品列表, 列出可点击进入
 */
export function WelcomeScreen() {
  const projects = useStore((s) => s.projects)
  const loaded = useStore((s) => s.loaded)
  const createProject = useStore((s) => s.createProject)
  const selectProject = useStore((s) => s.selectProject)
  const deleteProject = useStore((s) => s.deleteProject)
  const importProjectBackup = useStore((s) => s.importProjectBackup)

  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('mojian-theme')
    if (saved === 'light' || saved === 'dark') return saved
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  const [importMessage, setImportMessage] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('mojian-theme', next)
  }

  const handleCreate = async () => {
    const trimmed = name.trim()
    if (!trimmed || creating) return
    setCreating(true)
    try {
      const id = await createProject(trimmed, '')
      await selectProject(id)
    } finally {
      setCreating(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleCreate()
    }
  }

  const handleDelete = async (id: string, projectName: string) => {
    if (!window.confirm(`确定删除作品「${projectName}」吗？此操作不可撤销。`)) return
    await deleteProject(id)
  }

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const raw = JSON.parse(await file.text())
      const id = await importProjectBackup(raw)
      setImportMessage('备份恢复成功，正在打开…')
      await selectProject(id)
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : '备份读取失败')
    } finally {
      event.target.value = ''
    }
  }

  return (
    <div className="welcome">
      <button className="welcome-theme-button" onClick={toggleTheme} aria-label="切换明暗主题">
        <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
      </button>

      <main className="welcome-shell">
        <section className="welcome-hero">
          <div className="welcome-eyebrow"><span /> 为长篇创作理清脉络</div>
          <div className="welcome-logo">墨笺</div>
          <h1 className="welcome-title">让复杂故事，始终清晰可见</h1>
          <p className="welcome-desc">
            在一张策划台里组织章节结构、人物关系、故事时间线、伏笔与世界观。
            所有内容自动保存在当前浏览器，无需注册。
          </p>

          <div className="welcome-create-card">
            <label htmlFor="project-name">从一个作品名开始</label>
            <div className="welcome-create">
              <input
                id="project-name"
                type="text"
                placeholder="例如：雾港来信"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={creating}
                maxLength={80}
                autoFocus
              />
              <button onClick={handleCreate} disabled={creating || !name.trim()}>
                {creating ? '创建中…' : '创建作品'}
              </button>
            </div>
            <div className="welcome-local-note"><span /> 本地存储 · 自动保存 · 随时导出备份</div>
          </div>

          <div className="welcome-features" aria-label="主要功能">
            <div><strong>结构板</strong><span>编排章节与情节流向</span></div>
            <div><strong>人物图</strong><span>看清角色与关系网络</span></div>
            <div><strong>时间线</strong><span>对齐主线、支线与角色线</span></div>
            <div><strong>伏笔与百科</strong><span>守住回收闭环和设定一致性</span></div>
          </div>
        </section>

        <aside className="recent-projects" aria-label="已有作品">
          <div className="recent-projects-header">
            <div>
              <span className="section-kicker">WORKSPACE</span>
              <h2>继续创作</h2>
            </div>
            <div className="recent-projects-actions">
              {projects.length > 0 && <span className="project-count">{projects.length} 部作品</span>}
              <button className="import-backup-button" onClick={() => fileInputRef.current?.click()}>
                导入备份
              </button>
              <input
                ref={fileInputRef}
                className="visually-hidden"
                type="file"
                accept="application/json,.json"
                onChange={handleImport}
                aria-label="选择墨笺备份文件"
              />
            </div>
          </div>

          {importMessage && <div className="import-message" role="status">{importMessage}</div>}

          {!loaded && <div className="project-list-loading">正在读取本地作品…</div>}
          {loaded && projects.length === 0 && (
            <div className="project-list-empty">
              <span className="empty-mark">✦</span>
              <strong>你的策划台还是空的</strong>
              <p>创建第一部作品后，它会出现在这里。</p>
            </div>
          )}
          {loaded && projects.length > 0 && (
            <div className="project-list">
              {projects.map((p) => (
                <div key={p.id} className="project-item">
                  <button className="project-open" onClick={() => selectProject(p.id)}>
                    <span className="project-monogram">{p.name.trim().slice(0, 1) || '墨'}</span>
                    <span className="project-item-copy">
                      <span className="project-item-name">{p.name}</span>
                      <span className="project-item-desc">打开策划台继续整理</span>
                    </span>
                    <span className="project-arrow" aria-hidden="true">→</span>
                  </button>
                  <button
                    className="project-delete"
                    onClick={() => handleDelete(p.id, p.name)}
                    aria-label={`删除作品 ${p.name}`}
                    title="删除作品"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </aside>
      </main>

      <footer className="welcome-footer">
        <span>墨笺 · 小说策划台</span>
        <span>数据仅保存在你的浏览器中，请定期导出备份</span>
      </footer>
    </div>
  )
}
