import { lazy, Suspense, useEffect } from 'react'
import { useStore } from './store/useStore'
import { TopBar } from './components/TopBar'
import { WelcomeScreen } from './components/WelcomeScreen'

const ProjectOverview = lazy(() => import('./components/ProjectOverview').then((module) => ({ default: module.ProjectOverview })))
const StoryBoard = lazy(() => import('./components/StoryBoard').then((module) => ({ default: module.StoryBoard })))
const CharacterMap = lazy(() => import('./components/CharacterMap').then((module) => ({ default: module.CharacterMap })))
const Timeline = lazy(() => import('./components/Timeline').then((module) => ({ default: module.Timeline })))
const ForeshadowTable = lazy(() => import('./components/ForeshadowTable').then((module) => ({ default: module.ForeshadowTable })))
const WikiPanel = lazy(() => import('./components/WikiPanel').then((module) => ({ default: module.WikiPanel })))

function WorkspaceLoading() {
  return (
    <div className="workspace-loading" role="status" aria-live="polite">
      <span className="workspace-loading-mark">墨</span>
      <span>正在展开策划台…</span>
    </div>
  )
}

/**
 * 墨笺 · 小说策划台 — 主应用组件
 *
 * 负责整体布局与视图路由:
 * - 未选择作品时显示欢迎界面
 * - 选择作品后显示 TopBar + (Sidebar) + workspace
 * - workspace 内根据 viewMode 渲染对应的视图组件
 */
export default function App() {
  const loadProjects = useStore((s) => s.loadProjects)
  const currentProjectId = useStore((s) => s.currentProjectId)
  const viewMode = useStore((s) => s.viewMode)

  // 应用启动时加载项目列表
  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  // 未选择作品 -> 欢迎界面
  if (!currentProjectId) {
    return <WelcomeScreen />
  }

  // 已选择作品 -> 主工作区
  return (
    <div className="app">
      <TopBar />
      <div className="main">
        <div className="workspace">
          <Suspense fallback={<WorkspaceLoading />}>
            {viewMode === 'overview' && <ProjectOverview />}
            {viewMode === 'structure' && <StoryBoard />}
            {viewMode === 'characters' && <CharacterMap />}
            {viewMode === 'timeline' && <Timeline />}
            {viewMode === 'foreshadow' && <ForeshadowTable />}
            {viewMode === 'wiki' && <WikiPanel />}
          </Suspense>
        </div>
      </div>
    </div>
  )
}
