// ============================================================
// 核心类型定义
// ============================================================

/** 工作台视图 */
export type ViewMode = 'overview' | 'structure' | 'characters' | 'timeline' | 'foreshadow' | 'wiki';

/** 作品 */
export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
}

/** 章节卡片 (故事结构板上的节点) */
export interface StoryCard {
  id: string;
  projectId: string;
  title: string;
  summary: string;       // 章节摘要
  keyPoints: string;     // 关键情节 (换行分隔)
  notes: string;         // 备注/片段
  act: number;           // 第几幕
  order: number;         // 排序
  position: { x: number; y: number }; // 白板位置
  color: string;         // 卡片颜色
  createdAt: number;
  updatedAt: number;
}

/** 卡片间的连线 (情节流向) */
export interface StoryLink {
  id: string;
  projectId: string;
  source: string;  // card id
  target: string;  // card id
  label: string;   // 连线标注
}

/** 角色 */
export interface Character {
  id: string;
  projectId: string;
  name: string;
  aliases: string[];     // 别名
  role: string;          // 主角/配角/反派等
  description: string;   // 简介
  personality: string;   // 性格
  background: string;    // 背景
  position: { x: number; y: number }; // 关系图位置
  color: string;
  createdAt: number;
  updatedAt: number;
}

/** 角色关系 */
export interface CharacterRelation {
  id: string;
  projectId: string;
  source: string;  // character id
  target: string;  // character id
  type: string;    // 亲属/敌对/暗恋/盟友等
  description: string;
}

/** 时间线事件 */
export interface TimelineEvent {
  id: string;
  projectId: string;
  title: string;
  description: string;
  track: string;         // 轨道名 (主线/支线/角色线)
  order: number;         // 时间顺序
  chapterId?: string;    // 关联章节
  characterIds: string[];// 参与角色
  color: string;
  createdAt: number;
  updatedAt: number;
}

/** 伏笔 */
export interface Foreshadow {
  id: string;
  projectId: string;
  title: string;         // 伏笔名称
  description: string;   // 伏笔内容
  plantChapterId?: string;    // 埋设章节
  plantDescription: string;   // 埋设描述
  resolveChapterId?: string;  // 回收章节
  resolveDescription: string; // 回收描述
  status: 'planted' | 'resolved' | 'abandoned'; // 状态
  priority: 'low' | 'medium' | 'high';
  createdAt: number;
  updatedAt: number;
}

/** 百科词条 */
export interface WikiEntry {
  id: string;
  projectId: string;
  name: string;
  type: 'character' | 'location' | 'item' | 'event' | 'concept' | 'organization';
  aliases: string[];
  content: string;       // 词条内容 (纯文本)
  tags: string[];
  createdAt: number;
  updatedAt: number;
}
