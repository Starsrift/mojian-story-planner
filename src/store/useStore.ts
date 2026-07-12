import { create } from 'zustand';
import { db, uid } from '../db/database';
import type {
  Project, StoryCard, StoryLink, Character, CharacterRelation,
  TimelineEvent, Foreshadow, WikiEntry
} from '../types';

type ViewMode = 'structure' | 'characters' | 'timeline' | 'foreshadow' | 'wiki';

interface AppState {
  // 当前状态
  currentProjectId: string | null;
  viewMode: ViewMode;
  loaded: boolean;

  // 数据缓存
  projects: Project[];
  storyCards: StoryCard[];
  storyLinks: StoryLink[];
  characters: Character[];
  relations: CharacterRelation[];
  timelineEvents: TimelineEvent[];
  foreshadows: Foreshadow[];
  wikiEntries: WikiEntry[];

  // 选中状态
  selectedCardId: string | null;
  selectedCharacterId: string | null;

  // Actions: 项目
  loadProjects: () => Promise<void>;
  createProject: (name: string, description: string) => Promise<string>;
  deleteProject: (id: string) => Promise<void>;
  selectProject: (id: string) => Promise<void>;
  leaveProject: () => void;
  importProjectBackup: (raw: unknown) => Promise<string>;

  // Actions: 视图
  setViewMode: (mode: ViewMode) => void;

  // Actions: 故事卡片
  loadStoryCards: () => Promise<void>;
  createStoryCard: (partial: Partial<StoryCard>) => Promise<string>;
  updateStoryCard: (id: string, patch: Partial<StoryCard>) => Promise<void>;
  deleteStoryCard: (id: string) => Promise<void>;
  selectCard: (id: string | null) => void;

  // Actions: 卡片连线
  loadStoryLinks: () => Promise<void>;
  createStoryLink: (source: string, target: string, label?: string) => Promise<string>;
  deleteStoryLink: (id: string) => Promise<void>;

  // Actions: 角色
  loadCharacters: () => Promise<void>;
  createCharacter: (partial: Partial<Character>) => Promise<string>;
  updateCharacter: (id: string, patch: Partial<Character>) => Promise<void>;
  deleteCharacter: (id: string) => Promise<void>;
  selectCharacter: (id: string | null) => void;

  // Actions: 角色关系
  loadRelations: () => Promise<void>;
  createRelation: (source: string, target: string, type: string, description?: string) => Promise<string>;
  deleteRelation: (id: string) => Promise<void>;

  // Actions: 时间线
  loadTimelineEvents: () => Promise<void>;
  createTimelineEvent: (partial: Partial<TimelineEvent>) => Promise<string>;
  updateTimelineEvent: (id: string, patch: Partial<TimelineEvent>) => Promise<void>;
  deleteTimelineEvent: (id: string) => Promise<void>;

  // Actions: 伏笔
  loadForeshadows: () => Promise<void>;
  createForeshadow: (partial: Partial<Foreshadow>) => Promise<string>;
  updateForeshadow: (id: string, patch: Partial<Foreshadow>) => Promise<void>;
  deleteForeshadow: (id: string) => Promise<void>;

  // Actions: 百科
  loadWikiEntries: () => Promise<void>;
  createWikiEntry: (partial: Partial<WikiEntry>) => Promise<string>;
  updateWikiEntry: (id: string, patch: Partial<WikiEntry>) => Promise<void>;
  deleteWikiEntry: (id: string) => Promise<void>;
}

export const useStore = create<AppState>((set, get) => ({
  currentProjectId: null,
  viewMode: 'structure',
  loaded: false,
  projects: [],
  storyCards: [],
  storyLinks: [],
  characters: [],
  relations: [],
  timelineEvents: [],
  foreshadows: [],
  wikiEntries: [],
  selectedCardId: null,
  selectedCharacterId: null,

  // ====== 项目 ======
  loadProjects: async () => {
    const projects = await db.projects.orderBy('updatedAt').reverse().toArray();
    set({ projects, loaded: true });
  },

  createProject: async (name, description) => {
    const id = uid();
    const now = Date.now();
    const project: Project = {
      id, name, description,
      createdAt: now, updatedAt: now,
    };
    await db.projects.add(project);
    set((s) => ({ projects: [project, ...s.projects] }));
    return id;
  },

  deleteProject: async (id) => {
    await db.transaction('rw', [db.projects, db.storyCards, db.storyLinks, db.characters, db.relations, db.timelineEvents, db.foreshadows, db.wikiEntries], async () => {
      await db.projects.delete(id);
      await db.storyCards.where('projectId').equals(id).delete();
      await db.storyLinks.where('projectId').equals(id).delete();
      await db.characters.where('projectId').equals(id).delete();
      await db.relations.where('projectId').equals(id).delete();
      await db.timelineEvents.where('projectId').equals(id).delete();
      await db.foreshadows.where('projectId').equals(id).delete();
      await db.wikiEntries.where('projectId').equals(id).delete();
    });
    set((s) => ({
      projects: s.projects.filter((p) => p.id !== id),
      currentProjectId: s.currentProjectId === id ? null : s.currentProjectId,
    }));
  },

  selectProject: async (id) => {
    set({ currentProjectId: id, selectedCardId: null, selectedCharacterId: null });
    await get().loadStoryCards();
    await get().loadStoryLinks();
    await get().loadCharacters();
    await get().loadRelations();
    await get().loadTimelineEvents();
    await get().loadForeshadows();
    await get().loadWikiEntries();
  },

  leaveProject: () => set({
    currentProjectId: null,
    selectedCardId: null,
    selectedCharacterId: null,
  }),

  importProjectBackup: async (raw) => {
    const backup = raw as {
      format?: string;
      project?: Partial<Project>;
      data?: {
        storyCards?: StoryCard[];
        storyLinks?: StoryLink[];
        characters?: Character[];
        relations?: CharacterRelation[];
        timelineEvents?: TimelineEvent[];
        foreshadows?: Foreshadow[];
        wikiEntries?: WikiEntry[];
      };
    };

    if (backup?.format !== 'mojian-project' || !backup.project?.name || !backup.data) {
      throw new Error('这不是有效的墨笺作品备份');
    }

    const newProjectId = uid();
    const now = Date.now();
    const project: Project = {
      id: newProjectId,
      name: `${backup.project.name}（恢复）`,
      description: backup.project.description || '',
      createdAt: now,
      updatedAt: now,
    };

    const sourceCards = Array.isArray(backup.data.storyCards) ? backup.data.storyCards : [];
    const sourceCharacters = Array.isArray(backup.data.characters) ? backup.data.characters : [];
    const cardIds = new Map(sourceCards.map((card) => [card.id, uid()]));
    const characterIds = new Map(sourceCharacters.map((character) => [character.id, uid()]));

    const storyCards = sourceCards.map((card) => ({
      ...card, id: cardIds.get(card.id)!, projectId: newProjectId, createdAt: now, updatedAt: now,
    }));
    const characters = sourceCharacters.map((character) => ({
      ...character, id: characterIds.get(character.id)!, projectId: newProjectId, createdAt: now, updatedAt: now,
    }));
    const storyLinks = (Array.isArray(backup.data.storyLinks) ? backup.data.storyLinks : [])
      .filter((link) => cardIds.has(link.source) && cardIds.has(link.target))
      .map((link) => ({
        ...link, id: uid(), projectId: newProjectId,
        source: cardIds.get(link.source)!, target: cardIds.get(link.target)!,
      }));
    const relations = (Array.isArray(backup.data.relations) ? backup.data.relations : [])
      .filter((relation) => characterIds.has(relation.source) && characterIds.has(relation.target))
      .map((relation) => ({
        ...relation, id: uid(), projectId: newProjectId,
        source: characterIds.get(relation.source)!, target: characterIds.get(relation.target)!,
      }));
    const timelineEvents = (Array.isArray(backup.data.timelineEvents) ? backup.data.timelineEvents : []).map((event) => ({
      ...event,
      id: uid(),
      projectId: newProjectId,
      chapterId: event.chapterId ? cardIds.get(event.chapterId) : undefined,
      characterIds: event.characterIds.map((id) => characterIds.get(id)).filter((id): id is string => Boolean(id)),
      createdAt: now,
      updatedAt: now,
    }));
    const foreshadows = (Array.isArray(backup.data.foreshadows) ? backup.data.foreshadows : []).map((item) => ({
      ...item,
      id: uid(),
      projectId: newProjectId,
      plantChapterId: item.plantChapterId ? cardIds.get(item.plantChapterId) : undefined,
      resolveChapterId: item.resolveChapterId ? cardIds.get(item.resolveChapterId) : undefined,
      createdAt: now,
      updatedAt: now,
    }));
    const wikiEntries = (Array.isArray(backup.data.wikiEntries) ? backup.data.wikiEntries : []).map((entry) => ({
      ...entry, id: uid(), projectId: newProjectId, createdAt: now, updatedAt: now,
    }));

    await db.transaction('rw', [db.projects, db.storyCards, db.storyLinks, db.characters, db.relations, db.timelineEvents, db.foreshadows, db.wikiEntries], async () => {
      await db.projects.add(project);
      if (storyCards.length) await db.storyCards.bulkAdd(storyCards);
      if (storyLinks.length) await db.storyLinks.bulkAdd(storyLinks);
      if (characters.length) await db.characters.bulkAdd(characters);
      if (relations.length) await db.relations.bulkAdd(relations);
      if (timelineEvents.length) await db.timelineEvents.bulkAdd(timelineEvents);
      if (foreshadows.length) await db.foreshadows.bulkAdd(foreshadows);
      if (wikiEntries.length) await db.wikiEntries.bulkAdd(wikiEntries);
    });

    set((state) => ({ projects: [project, ...state.projects] }));
    return newProjectId;
  },

  // ====== 视图 ======
  setViewMode: (mode) => set({ viewMode: mode }),

  // ====== 故事卡片 ======
  loadStoryCards: async () => {
    const pid = get().currentProjectId;
    if (!pid) return;
    const cards = await db.storyCards.where('projectId').equals(pid).toArray();
    cards.sort((a, b) => a.order - b.order);
    set({ storyCards: cards });
  },

  createStoryCard: async (partial) => {
    const pid = get().currentProjectId!;
    const id = uid();
    const now = Date.now();
    const card: StoryCard = {
      id, projectId: pid,
      title: partial.title || '新章节',
      summary: partial.summary || '',
      keyPoints: partial.keyPoints || '',
      notes: partial.notes || '',
      act: partial.act ?? 1,
      order: partial.order ?? get().storyCards.length,
      position: partial.position || { x: 100 + get().storyCards.length * 60, y: 100 },
      color: partial.color || '#8b5e3c',
      createdAt: now, updatedAt: now,
    };
    await db.storyCards.add(card);
    set((s) => ({ storyCards: [...s.storyCards, card] }));
    return id;
  },

  updateStoryCard: async (id, patch) => {
    await db.storyCards.update(id, { ...patch, updatedAt: Date.now() });
    set((s) => ({
      storyCards: s.storyCards.map((c) => c.id === id ? { ...c, ...patch, updatedAt: Date.now() } : c),
    }));
  },

  deleteStoryCard: async (id) => {
    await db.storyCards.delete(id);
    await db.storyLinks.where('source').equals(id).or('target').equals(id).delete();
    set((s) => ({
      storyCards: s.storyCards.filter((c) => c.id !== id),
      storyLinks: s.storyLinks.filter((l) => l.source !== id && l.target !== id),
      selectedCardId: s.selectedCardId === id ? null : s.selectedCardId,
    }));
  },

  selectCard: (id) => set({ selectedCardId: id }),

  // ====== 卡片连线 ======
  loadStoryLinks: async () => {
    const pid = get().currentProjectId;
    if (!pid) return;
    const links = await db.storyLinks.where('projectId').equals(pid).toArray();
    set({ storyLinks: links });
  },

  createStoryLink: async (source, target, label = '') => {
    const pid = get().currentProjectId!;
    const id = uid();
    const link: StoryLink = { id, projectId: pid, source, target, label };
    await db.storyLinks.add(link);
    set((s) => ({ storyLinks: [...s.storyLinks, link] }));
    return id;
  },

  deleteStoryLink: async (id) => {
    await db.storyLinks.delete(id);
    set((s) => ({ storyLinks: s.storyLinks.filter((l) => l.id !== id) }));
  },

  // ====== 角色 ======
  loadCharacters: async () => {
    const pid = get().currentProjectId;
    if (!pid) return;
    const chars = await db.characters.where('projectId').equals(pid).toArray();
    set({ characters: chars });
  },

  createCharacter: async (partial) => {
    const pid = get().currentProjectId!;
    const id = uid();
    const now = Date.now();
    const char: Character = {
      id, projectId: pid,
      name: partial.name || '新角色',
      aliases: partial.aliases || [],
      role: partial.role || '配角',
      description: partial.description || '',
      personality: partial.personality || '',
      background: partial.background || '',
      position: partial.position || { x: 200 + get().characters.length * 50, y: 200 },
      color: partial.color || '#c4683f',
      createdAt: now, updatedAt: now,
    };
    await db.characters.add(char);
    set((s) => ({ characters: [...s.characters, char] }));
    return id;
  },

  updateCharacter: async (id, patch) => {
    await db.characters.update(id, { ...patch, updatedAt: Date.now() });
    set((s) => ({
      characters: s.characters.map((c) => c.id === id ? { ...c, ...patch, updatedAt: Date.now() } : c),
    }));
  },

  deleteCharacter: async (id) => {
    await db.characters.delete(id);
    await db.relations.where('source').equals(id).or('target').equals(id).delete();
    set((s) => ({
      characters: s.characters.filter((c) => c.id !== id),
      relations: s.relations.filter((r) => r.source !== id && r.target !== id),
      selectedCharacterId: s.selectedCharacterId === id ? null : s.selectedCharacterId,
    }));
  },

  selectCharacter: (id) => set({ selectedCharacterId: id }),

  // ====== 角色关系 ======
  loadRelations: async () => {
    const pid = get().currentProjectId;
    if (!pid) return;
    const rels = await db.relations.where('projectId').equals(pid).toArray();
    set({ relations: rels });
  },

  createRelation: async (source, target, type, description = '') => {
    const pid = get().currentProjectId!;
    const id = uid();
    const rel: CharacterRelation = { id, projectId: pid, source, target, type, description };
    await db.relations.add(rel);
    set((s) => ({ relations: [...s.relations, rel] }));
    return id;
  },

  deleteRelation: async (id) => {
    await db.relations.delete(id);
    set((s) => ({ relations: s.relations.filter((r) => r.id !== id) }));
  },

  // ====== 时间线 ======
  loadTimelineEvents: async () => {
    const pid = get().currentProjectId;
    if (!pid) return;
    const events = await db.timelineEvents.where('projectId').equals(pid).toArray();
    events.sort((a, b) => a.order - b.order);
    set({ timelineEvents: events });
  },

  createTimelineEvent: async (partial) => {
    const pid = get().currentProjectId!;
    const id = uid();
    const now = Date.now();
    const event: TimelineEvent = {
      id, projectId: pid,
      title: partial.title || '新事件',
      description: partial.description || '',
      track: partial.track || '主线',
      order: partial.order ?? get().timelineEvents.length,
      chapterId: partial.chapterId,
      characterIds: partial.characterIds || [],
      color: partial.color || '#8b5e3c',
      createdAt: now, updatedAt: now,
    };
    await db.timelineEvents.add(event);
    set((s) => ({ timelineEvents: [...s.timelineEvents, event] }));
    return id;
  },

  updateTimelineEvent: async (id, patch) => {
    await db.timelineEvents.update(id, { ...patch, updatedAt: Date.now() });
    set((s) => ({
      timelineEvents: s.timelineEvents.map((e) => e.id === id ? { ...e, ...patch, updatedAt: Date.now() } : e),
    }));
  },

  deleteTimelineEvent: async (id) => {
    await db.timelineEvents.delete(id);
    set((s) => ({ timelineEvents: s.timelineEvents.filter((e) => e.id !== id) }));
  },

  // ====== 伏笔 ======
  loadForeshadows: async () => {
    const pid = get().currentProjectId;
    if (!pid) return;
    const fs = await db.foreshadows.where('projectId').equals(pid).toArray();
    set({ foreshadows: fs });
  },

  createForeshadow: async (partial) => {
    const pid = get().currentProjectId!;
    const id = uid();
    const now = Date.now();
    const f: Foreshadow = {
      id, projectId: pid,
      title: partial.title || '新伏笔',
      description: partial.description || '',
      plantChapterId: partial.plantChapterId,
      plantDescription: partial.plantDescription || '',
      resolveChapterId: partial.resolveChapterId,
      resolveDescription: partial.resolveDescription || '',
      status: partial.status || 'planted',
      priority: partial.priority || 'medium',
      createdAt: now, updatedAt: now,
    };
    await db.foreshadows.add(f);
    set((s) => ({ foreshadows: [...s.foreshadows, f] }));
    return id;
  },

  updateForeshadow: async (id, patch) => {
    await db.foreshadows.update(id, { ...patch, updatedAt: Date.now() });
    set((s) => ({
      foreshadows: s.foreshadows.map((f) => f.id === id ? { ...f, ...patch, updatedAt: Date.now() } : f),
    }));
  },

  deleteForeshadow: async (id) => {
    await db.foreshadows.delete(id);
    set((s) => ({ foreshadows: s.foreshadows.filter((f) => f.id !== id) }));
  },

  // ====== 百科 ======
  loadWikiEntries: async () => {
    const pid = get().currentProjectId;
    if (!pid) return;
    const entries = await db.wikiEntries.where('projectId').equals(pid).toArray();
    set({ wikiEntries: entries });
  },

  createWikiEntry: async (partial) => {
    const pid = get().currentProjectId!;
    const id = uid();
    const now = Date.now();
    const entry: WikiEntry = {
      id, projectId: pid,
      name: partial.name || '新词条',
      type: partial.type || 'concept',
      aliases: partial.aliases || [],
      content: partial.content || '',
      tags: partial.tags || [],
      createdAt: now, updatedAt: now,
    };
    await db.wikiEntries.add(entry);
    set((s) => ({ wikiEntries: [...s.wikiEntries, entry] }));
    return id;
  },

  updateWikiEntry: async (id, patch) => {
    await db.wikiEntries.update(id, { ...patch, updatedAt: Date.now() });
    set((s) => ({
      wikiEntries: s.wikiEntries.map((e) => e.id === id ? { ...e, ...patch, updatedAt: Date.now() } : e),
    }));
  },

  deleteWikiEntry: async (id) => {
    await db.wikiEntries.delete(id);
    set((s) => ({ wikiEntries: s.wikiEntries.filter((e) => e.id !== id) }));
  },
}));
