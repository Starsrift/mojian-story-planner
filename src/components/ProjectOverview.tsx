import { useMemo, type CSSProperties } from 'react'
import { useStore } from '../store/useStore'
import type { ViewMode } from '../types'

type Tone = 'accent' | 'success' | 'warning' | 'danger' | 'muted'

interface ActionItem {
  title: string
  detail: string
  view: ViewMode
  tone: Tone
}

const TONE_COLOR: Record<Tone, string> = {
  accent: 'var(--accent)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
  muted: 'var(--muted)',
}

function countText(text: string): number {
  return text.replace(/\s/g, '').length
}

function percent(value: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((value / total) * 100)
}

function formatDate(timestamp?: number): string {
  if (!timestamp) return '暂无记录'
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
}

export function ProjectOverview() {
  const projects = useStore((s) => s.projects)
  const currentProjectId = useStore((s) => s.currentProjectId)
  const setViewMode = useStore((s) => s.setViewMode)
  const storyCards = useStore((s) => s.storyCards)
  const storyLinks = useStore((s) => s.storyLinks)
  const characters = useStore((s) => s.characters)
  const relations = useStore((s) => s.relations)
  const timelineEvents = useStore((s) => s.timelineEvents)
  const foreshadows = useStore((s) => s.foreshadows)
  const wikiEntries = useStore((s) => s.wikiEntries)

  const currentProject = projects.find((p) => p.id === currentProjectId)

  const metrics = useMemo(() => {
    const chaptersWithSummary = storyCards.filter((card) => card.summary.trim()).length
    const chaptersWithNotes = storyCards.filter((card) => card.notes.trim()).length
    const outlineChars = storyCards.reduce(
      (sum, card) => sum + countText(card.summary) + countText(card.keyPoints) + countText(card.notes),
      0
    )
    const profiledCharacters = characters.filter(
      (character) =>
        character.description.trim() ||
        character.personality.trim() ||
        character.background.trim()
    ).length
    const linkedTimelineEvents = timelineEvents.filter(
      (event) => event.chapterId || event.characterIds.length > 0
    ).length
    const resolvedForeshadows = foreshadows.filter((item) => item.status === 'resolved').length
    const openForeshadows = foreshadows.filter((item) => item.status === 'planted')
    const highPriorityOpenForeshadows = openForeshadows.filter((item) => item.priority === 'high')
    const richWikiEntries = wikiEntries.filter((entry) => countText(entry.content) >= 20).length

    return {
      chaptersWithSummary,
      chaptersWithNotes,
      outlineChars,
      profiledCharacters,
      linkedTimelineEvents,
      resolvedForeshadows,
      openForeshadows,
      highPriorityOpenForeshadows,
      richWikiEntries,
    }
  }, [characters, foreshadows, storyCards, timelineEvents, wikiEntries])

  const actionItems = useMemo<ActionItem[]>(() => {
    const items: ActionItem[] = []
    const missingSummary = storyCards.filter((card) => !card.summary.trim())
    const thinCharacters = characters.filter(
      (character) =>
        !character.description.trim() &&
        !character.personality.trim() &&
        !character.background.trim()
    )
    const floatingEvents = timelineEvents.filter(
      (event) => !event.chapterId && event.characterIds.length === 0
    )
    const thinWikiEntries = wikiEntries.filter((entry) => countText(entry.content) < 20)

    if (storyCards.length === 0) {
      items.push({
        title: '搭建第一批章节卡片',
        detail: '结构板还没有章节，先把故事骨架放到画布上。',
        view: 'structure',
        tone: 'accent',
      })
    } else if (missingSummary.length > 0) {
      items.push({
        title: `补全 ${missingSummary.length} 个章节摘要`,
        detail: `例如「${missingSummary[0].title || '未命名章节'}」还没有摘要。`,
        view: 'structure',
        tone: 'warning',
      })
    }

    if (characters.length === 0) {
      items.push({
        title: '建立核心角色',
        detail: '人物图还没有角色，先放入主角、对手和关键配角。',
        view: 'characters',
        tone: 'accent',
      })
    } else if (thinCharacters.length > 0) {
      items.push({
        title: `完善 ${thinCharacters.length} 个角色档案`,
        detail: `「${thinCharacters[0].name}」还缺少简介、性格或背景。`,
        view: 'characters',
        tone: 'warning',
      })
    }

    if (timelineEvents.length === 0) {
      items.push({
        title: '铺出主线时间线',
        detail: '添加关键事件，检查因果、节奏和角色出场顺序。',
        view: 'timeline',
        tone: 'accent',
      })
    } else if (floatingEvents.length > 0) {
      items.push({
        title: `关联 ${floatingEvents.length} 个时间线事件`,
        detail: '把事件连到章节或参与角色，后续回查会更清楚。',
        view: 'timeline',
        tone: 'warning',
      })
    }

    if (metrics.highPriorityOpenForeshadows.length > 0) {
      items.push({
        title: `处理 ${metrics.highPriorityOpenForeshadows.length} 条高优先级伏笔`,
        detail: `「${metrics.highPriorityOpenForeshadows[0].title}」仍处于已埋设状态。`,
        view: 'foreshadow',
        tone: 'danger',
      })
    } else if (metrics.openForeshadows.length > 0) {
      items.push({
        title: `跟进 ${metrics.openForeshadows.length} 条未闭合伏笔`,
        detail: '确认它们会被回收、延后，还是明确放弃。',
        view: 'foreshadow',
        tone: 'warning',
      })
    }

    if (wikiEntries.length === 0) {
      items.push({
        title: '沉淀世界观词条',
        detail: '把地点、组织、物品和概念收进百科，减少设定漂移。',
        view: 'wiki',
        tone: 'accent',
      })
    } else if (thinWikiEntries.length > 0) {
      items.push({
        title: `扩写 ${thinWikiEntries.length} 个百科词条`,
        detail: `「${thinWikiEntries[0].name}」内容偏短，可以补规则、历史或关联。`,
        view: 'wiki',
        tone: 'warning',
      })
    }

    if (items.length === 0) {
      items.push({
        title: '工作台状态良好',
        detail: '核心模块都有内容，可以继续细化章节节奏或导出备份。',
        view: 'structure',
        tone: 'success',
      })
    }

    return items.slice(0, 5)
  }, [
    characters,
    metrics.highPriorityOpenForeshadows,
    metrics.openForeshadows,
    storyCards,
    timelineEvents,
    wikiEntries,
  ])

  const progressCards = [
    {
      label: '章节摘要',
      value: metrics.chaptersWithSummary,
      total: storyCards.length,
      hint: '有摘要的章节',
      tone: 'accent' as Tone,
    },
    {
      label: '角色档案',
      value: metrics.profiledCharacters,
      total: characters.length,
      hint: '已有设定内容的角色',
      tone: 'success' as Tone,
    },
    {
      label: '事件关联',
      value: metrics.linkedTimelineEvents,
      total: timelineEvents.length,
      hint: '已关联章节或角色',
      tone: 'accent' as Tone,
    },
    {
      label: '伏笔回收',
      value: metrics.resolvedForeshadows,
      total: foreshadows.length,
      hint: '已回收的伏笔',
      tone: 'warning' as Tone,
    },
    {
      label: '百科内容',
      value: metrics.richWikiEntries,
      total: wikiEntries.length,
      hint: '内容超过 20 字的词条',
      tone: 'success' as Tone,
    },
  ]

  const quickLinks: { view: ViewMode; label: string; count: number; hint: string }[] = [
    { view: 'structure', label: '结构板', count: storyCards.length, hint: '章节' },
    { view: 'characters', label: '人物图', count: characters.length, hint: '角色' },
    { view: 'timeline', label: '时间线', count: timelineEvents.length, hint: '事件' },
    { view: 'foreshadow', label: '伏笔表', count: foreshadows.length, hint: '伏笔' },
    { view: 'wiki', label: '百科', count: wikiEntries.length, hint: '词条' },
  ]

  return (
    <div style={styles.view}>
      <section style={styles.hero}>
        <div style={styles.heroCopy}>
          <span style={styles.kicker}>PROJECT OVERVIEW</span>
          <h1 style={styles.title}>{currentProject?.name || '未命名作品'}</h1>
          <p style={styles.subtitle}>
            {currentProject?.description || '从这里检查故事骨架、人物网络、时间线、伏笔闭环与世界观沉淀。'}
          </p>
          <div style={styles.heroMeta}>
            <span>更新于 {formatDate(currentProject?.updatedAt)}</span>
            <span>{metrics.outlineChars.toLocaleString()} 字策划文本</span>
            <span>{metrics.openForeshadows.length} 条未闭合伏笔</span>
          </div>
        </div>

        <div style={styles.scorePanel}>
          <div style={styles.scoreLabel}>当前材料</div>
          <div style={styles.scoreValue}>{metrics.outlineChars.toLocaleString()}</div>
          <div style={styles.scoreHint}>摘要、关键情节与备注累计字数</div>
        </div>
      </section>

      <section style={styles.quickGrid} aria-label="模块快捷入口">
        {quickLinks.map((link) => (
          <button
            key={link.view}
            type="button"
            style={styles.quickCard}
            onClick={() => setViewMode(link.view)}
          >
            <span style={styles.quickLabel}>{link.label}</span>
            <strong style={styles.quickCount}>{link.count}</strong>
            <span style={styles.quickHint}>{link.hint}</span>
          </button>
        ))}
      </section>

      <section style={styles.contentGrid}>
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <div>
              <span style={styles.kicker}>PROGRESS</span>
              <h2 style={styles.panelTitle}>模块完成度</h2>
            </div>
          </div>
          <div style={styles.progressList}>
            {progressCards.map((item) => (
              <ProgressRow
                key={item.label}
                label={item.label}
                value={item.value}
                total={item.total}
                hint={item.hint}
                tone={item.tone}
              />
            ))}
          </div>
        </div>

        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <div>
              <span style={styles.kicker}>NEXT</span>
              <h2 style={styles.panelTitle}>下一步建议</h2>
            </div>
          </div>
          <div style={styles.actionList}>
            {actionItems.map((item) => (
              <button
                key={`${item.view}-${item.title}`}
                type="button"
                style={{
                  ...styles.actionItem,
                  borderLeftColor: TONE_COLOR[item.tone],
                }}
                onClick={() => setViewMode(item.view)}
              >
                <span style={{ ...styles.actionTitle, color: TONE_COLOR[item.tone] }}>
                  {item.title}
                </span>
                <span style={styles.actionDetail}>{item.detail}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section style={styles.insightGrid}>
        <InsightCard
          label="故事结构"
          value={`${storyCards.length} 章`}
          detail={`${storyLinks.length} 条情节连线，${metrics.chaptersWithNotes} 章已有备注或片段`}
          tone="accent"
        />
        <InsightCard
          label="人物网络"
          value={`${characters.length} 人`}
          detail={`${relations.length} 条人物关系，${metrics.profiledCharacters} 人已有档案内容`}
          tone="success"
        />
        <InsightCard
          label="时间与伏笔"
          value={`${timelineEvents.length + foreshadows.length} 项`}
          detail={`${timelineEvents.length} 个事件，${metrics.resolvedForeshadows} 条伏笔已回收`}
          tone={metrics.highPriorityOpenForeshadows.length > 0 ? 'danger' : 'warning'}
        />
        <InsightCard
          label="世界观百科"
          value={`${wikiEntries.length} 条`}
          detail={`${metrics.richWikiEntries} 条词条已有较完整内容`}
          tone="muted"
        />
      </section>
    </div>
  )
}

function ProgressRow({
  label,
  value,
  total,
  hint,
  tone,
}: {
  label: string
  value: number
  total: number
  hint: string
  tone: Tone
}) {
  const ratio = percent(value, total)
  const color = TONE_COLOR[tone]

  return (
    <div style={styles.progressRow}>
      <div style={styles.progressMeta}>
        <span style={styles.progressLabel}>{label}</span>
        <span style={styles.progressValue}>
          {total === 0 ? '暂无数据' : `${value}/${total} · ${ratio}%`}
        </span>
      </div>
      <div style={styles.progressTrack}>
        <div
          style={{
            ...styles.progressFill,
            width: `${ratio}%`,
            background: color,
          }}
        />
      </div>
      <div style={styles.progressHint}>{hint}</div>
    </div>
  )
}

function InsightCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string
  value: string
  detail: string
  tone: Tone
}) {
  return (
    <div style={{ ...styles.insightCard, borderTopColor: TONE_COLOR[tone] }}>
      <span style={styles.insightLabel}>{label}</span>
      <strong style={styles.insightValue}>{value}</strong>
      <span style={styles.insightDetail}>{detail}</span>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  view: {
    height: '100%',
    width: '100%',
    overflow: 'auto',
    padding: '24px',
    background: 'var(--bg)',
  },
  hero: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
    gap: 18,
    alignItems: 'stretch',
    marginBottom: 16,
  },
  heroCopy: {
    padding: 22,
    border: '1px solid var(--rule)',
    borderRadius: 8,
    background: 'var(--bg-panel)',
    boxShadow: 'var(--shadow-sm)',
  },
  kicker: {
    display: 'inline-block',
    color: 'var(--accent)',
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: '.18em',
  },
  title: {
    marginTop: 6,
    fontFamily: "'Songti SC', 'STSong', 'SimSun', serif",
    fontSize: 30,
    letterSpacing: 2,
  },
  subtitle: {
    maxWidth: 760,
    marginTop: 8,
    color: 'var(--muted)',
    fontSize: 14,
    lineHeight: 1.8,
  },
  heroMeta: {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
    marginTop: 16,
    color: 'var(--muted)',
    fontSize: 12,
  },
  scorePanel: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    padding: 22,
    border: '1px solid var(--rule)',
    borderRadius: 8,
    background: 'var(--accent)',
    color: 'var(--accent-ink)',
    boxShadow: 'var(--shadow-sm)',
  },
  scoreLabel: {
    fontSize: 12,
    opacity: .78,
    letterSpacing: '.14em',
  },
  scoreValue: {
    marginTop: 6,
    fontSize: 34,
    fontWeight: 800,
    lineHeight: 1.1,
  },
  scoreHint: {
    marginTop: 8,
    fontSize: 12,
    opacity: .82,
  },
  quickGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: 10,
    marginBottom: 16,
  },
  quickCard: {
    minHeight: 86,
    padding: '14px 16px',
    textAlign: 'left',
    border: '1px solid var(--rule)',
    borderRadius: 8,
    background: 'var(--bg-panel)',
    boxShadow: 'var(--shadow-sm)',
    transition: 'border-color var(--transition), background var(--transition), transform var(--transition)',
  },
  quickLabel: {
    display: 'block',
    color: 'var(--muted)',
    fontSize: 12,
  },
  quickCount: {
    display: 'block',
    marginTop: 2,
    color: 'var(--ink)',
    fontSize: 24,
    lineHeight: 1.2,
  },
  quickHint: {
    display: 'block',
    marginTop: 2,
    color: 'var(--accent)',
    fontSize: 12,
  },
  contentGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
    gap: 16,
    marginBottom: 16,
  },
  panel: {
    border: '1px solid var(--rule)',
    borderRadius: 8,
    background: 'var(--bg-panel)',
    boxShadow: 'var(--shadow-sm)',
    overflow: 'hidden',
  },
  panelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    padding: '16px 18px',
    borderBottom: '1px solid var(--rule)',
  },
  panelTitle: {
    marginTop: 3,
    fontSize: 18,
  },
  progressList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    padding: 18,
  },
  progressRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  progressMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
  },
  progressLabel: {
    fontWeight: 700,
  },
  progressValue: {
    color: 'var(--muted)',
    fontSize: 12,
  },
  progressTrack: {
    height: 8,
    overflow: 'hidden',
    borderRadius: 999,
    background: 'var(--bg3)',
  },
  progressFill: {
    height: '100%',
    minWidth: 0,
    borderRadius: 999,
    transition: 'width var(--transition)',
  },
  progressHint: {
    color: 'var(--muted)',
    fontSize: 12,
  },
  actionList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: 18,
  },
  actionItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    width: '100%',
    padding: '12px 13px',
    textAlign: 'left',
    border: '1px solid var(--rule)',
    borderLeft: '4px solid var(--accent)',
    borderRadius: 8,
    background: 'var(--bg2)',
    transition: 'background var(--transition), border-color var(--transition)',
  },
  actionTitle: {
    fontWeight: 700,
    fontSize: 14,
  },
  actionDetail: {
    color: 'var(--muted)',
    fontSize: 12,
    lineHeight: 1.6,
  },
  insightGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
    gap: 12,
  },
  insightCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: 16,
    border: '1px solid var(--rule)',
    borderTop: '4px solid var(--accent)',
    borderRadius: 8,
    background: 'var(--bg-panel)',
    boxShadow: 'var(--shadow-sm)',
  },
  insightLabel: {
    color: 'var(--muted)',
    fontSize: 12,
  },
  insightValue: {
    color: 'var(--ink)',
    fontSize: 23,
    lineHeight: 1.2,
  },
  insightDetail: {
    color: 'var(--muted)',
    fontSize: 12,
    lineHeight: 1.6,
  },
}
