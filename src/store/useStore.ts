import { create } from 'zustand';
import { uid } from '../db/database';
import { storage } from '../db/storage';
import { KeyedWriteQueue } from './writeQueue';
import type {
  Project, StoryCard, StoryLink, Character, CharacterRelation,
  TimelineEvent, Foreshadow, WikiEntry
} from '../types';

type ViewMode = 'structure' | 'characters' | 'timeline' | 'foreshadow' | 'wiki';

const entityWriteQueue = new KeyedWriteQueue();

function entityWriteKey(kind: string, id: string) {
  return `${kind}:${id}`;
}

async function runEntityWrite<T>(kind: string, id: string, task: () => Promise<T>): Promise<T> {
  const finishQueuedMutation = storage.beginQueuedMutation();
  try {
    return await entityWriteQueue.run(entityWriteKey(kind, id), task);
  } finally {
    finishQueuedMutation();
  }
}

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
    const projects = await storage.listProjects();
    set({ projects, loaded: true });
  },

  createProject: async (name, description) => {
    const id = uid();
    const now = Date.now();
    const project: Project = {
      id, name, description,
      createdAt: now, updatedAt: now,
    };
    await storage.putProject(project);
    set((s) => ({ projects: [project, ...s.projects] }));
    return id;
  },

  deleteProject: async (id) => {
    await storage.deleteProject(id);
    set((s) => ({
      projects: s.projects.filter((p) => p.id !== id),
      currentProjectId: s.currentProjectId === id ? null : s.currentProjectId,
    }));
  },

  selectProject: async (id) => {
    await entityWriteQueue.onIdle();
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
    const localSnapshot = raw as {
      format?: string;
      projects?: unknown[];
    };

    if (localSnapshot?.format === 'mojian-local-snapshot') {
      if (!Array.isArray(localSnapshot.projects) || localSnapshot.projects.length === 0) {
        throw new Error('这个墨笺本地备份中没有可恢复的作品');
      }

      let firstProjectId = '';
      for (const projectBackup of localSnapshot.projects) {
        const restoredId = await get().importProjectBackup(projectBackup);
        if (!firstProjectId) firstProjectId = restoredId;
      }
      return firstProjectId;
    }

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

    await storage.importProjectBundle({
      project,
      data: {
        storyCards,
        storyLinks,
        characters,
        relations,
        timelineEvents,
        foreshadows,
        wikiEntries,
      },
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
    const cards = await storage.listEntities('storyCards', pid);
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
    await storage.putEntity('storyCards', card);
    set((s) => ({ storyCards: [...s.storyCards, card] }));
    return id;
  },

  updateStoryCard: async (id, patch) => {
    await runEntityWrite('storyCards', id, async () => {
      const current = get().storyCards.find((card) => card.id === id);
      if (!current) return;
      const updatedAt = Date.now();
      const next = { ...current, ...patch, updatedAt };
      await storage.putEntity('storyCards', next);
      set((s) => ({
        storyCards: s.storyCards.map((c) => c.id === id ? next : c),
      }));
    });
  },

  deleteStoryCard: async (id) => {
    await runEntityWrite('storyCards', id, async () => {
      await storage.deleteStoryCard(id);
      set((s) => ({
        storyCards: s.storyCards.filter((c) => c.id !== id),
        storyLinks: s.storyLinks.filter((l) => l.source !== id && l.target !== id),
        selectedCardId: s.selectedCardId === id ? null : s.selectedCardId,
      }));
    });
  },

  selectCard: (id) => set({ selectedCardId: id }),

  // ====== 卡片连线 ======
  loadStoryLinks: async () => {
    const pid = get().currentProjectId;
    if (!pid) return;
    const links = await storage.listEntities('storyLinks', pid);
    set({ storyLinks: links });
  },

  createStoryLink: async (source, target, label = '') => {
    const pid = get().currentProjectId!;
    const id = uid();
    const link: StoryLink = { id, projectId: pid, source, target, label };
    await storage.putEntity('storyLinks', link);
    set((s) => ({ storyLinks: [...s.storyLinks, link] }));
    return id;
  },

  deleteStoryLink: async (id) => {
    await storage.deleteEntity('storyLinks', id);
    set((s) => ({ storyLinks: s.storyLinks.filter((l) => l.id !== id) }));
  },

  // ====== 角色 ======
  loadCharacters: async () => {
    const pid = get().currentProjectId;
    if (!pid) return;
    const chars = await storage.listEntities('characters', pid);
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
    await storage.putEntity('characters', char);
    set((s) => ({ characters: [...s.characters, char] }));
    return id;
  },

  updateCharacter: async (id, patch) => {
    await runEntityWrite('characters', id, async () => {
      const current = get().characters.find((character) => character.id === id);
      if (!current) return;
      const updatedAt = Date.now();
      const next = { ...current, ...patch, updatedAt };
      await storage.putEntity('characters', next);
      set((s) => ({
        characters: s.characters.map((c) => c.id === id ? next : c),
      }));
    });
  },

  deleteCharacter: async (id) => {
    await runEntityWrite('characters', id, async () => {
      await storage.deleteCharacter(id);
      set((s) => ({
        characters: s.characters.filter((c) => c.id !== id),
        relations: s.relations.filter((r) => r.source !== id && r.target !== id),
        selectedCharacterId: s.selectedCharacterId === id ? null : s.selectedCharacterId,
      }));
    });
  },

  selectCharacter: (id) => set({ selectedCharacterId: id }),

  // ====== 角色关系 ======
  loadRelations: async () => {
    const pid = get().currentProjectId;
    if (!pid) return;
    const rels = await storage.listEntities('relations', pid);
    set({ relations: rels });
  },

  createRelation: async (source, target, type, description = '') => {
    const pid = get().currentProjectId!;
    const id = uid();
    const rel: CharacterRelation = { id, projectId: pid, source, target, type, description };
    await storage.putEntity('relations', rel);
    set((s) => ({ relations: [...s.relations, rel] }));
    return id;
  },

  deleteRelation: async (id) => {
    await storage.deleteEntity('relations', id);
    set((s) => ({ relations: s.relations.filter((r) => r.id !== id) }));
  },

  // ====== 时间线 ======
  loadTimelineEvents: async () => {
    const pid = get().currentProjectId;
    if (!pid) return;
    const events = await storage.listEntities('timelineEvents', pid);
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
    await storage.putEntity('timelineEvents', event);
    set((s) => ({ timelineEvents: [...s.timelineEvents, event] }));
    return id;
  },

  updateTimelineEvent: async (id, patch) => {
    await runEntityWrite('timelineEvents', id, async () => {
      const current = get().timelineEvents.find((event) => event.id === id);
      if (!current) return;
      const updatedAt = Date.now();
      const next = { ...current, ...patch, updatedAt };
      await storage.putEntity('timelineEvents', next);
      set((s) => ({
        timelineEvents: s.timelineEvents.map((e) => e.id === id ? next : e),
      }));
    });
  },

  deleteTimelineEvent: async (id) => {
    await runEntityWrite('timelineEvents', id, async () => {
      await storage.deleteEntity('timelineEvents', id);
      set((s) => ({ timelineEvents: s.timelineEvents.filter((e) => e.id !== id) }));
    });
  },

  // ====== 伏笔 ======
  loadForeshadows: async () => {
    const pid = get().currentProjectId;
    if (!pid) return;
    const fs = await storage.listEntities('foreshadows', pid);
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
    await storage.putEntity('foreshadows', f);
    set((s) => ({ foreshadows: [...s.foreshadows, f] }));
    return id;
  },

  updateForeshadow: async (id, patch) => {
    await runEntityWrite('foreshadows', id, async () => {
      const current = get().foreshadows.find((foreshadow) => foreshadow.id === id);
      if (!current) return;
      const updatedAt = Date.now();
      const next = { ...current, ...patch, updatedAt };
      await storage.putEntity('foreshadows', next);
      set((s) => ({
        foreshadows: s.foreshadows.map((f) => f.id === id ? next : f),
      }));
    });
  },

  deleteForeshadow: async (id) => {
    await runEntityWrite('foreshadows', id, async () => {
      await storage.deleteEntity('foreshadows', id);
      set((s) => ({ foreshadows: s.foreshadows.filter((f) => f.id !== id) }));
    });
  },

  // ====== 百科 ======
  loadWikiEntries: async () => {
    const pid = get().currentProjectId;
    if (!pid) return;
    const entries = await storage.listEntities('wikiEntries', pid);
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
    await storage.putEntity('wikiEntries', entry);
    set((s) => ({ wikiEntries: [...s.wikiEntries, entry] }));
    return id;
  },

  updateWikiEntry: async (id, patch) => {
    await runEntityWrite('wikiEntries', id, async () => {
      const current = get().wikiEntries.find((entry) => entry.id === id);
      if (!current) return;
      const updatedAt = Date.now();
      const next = { ...current, ...patch, updatedAt };
      await storage.putEntity('wikiEntries', next);
      set((s) => ({
        wikiEntries: s.wikiEntries.map((e) => e.id === id ? next : e),
      }));
    });
  },

  deleteWikiEntry: async (id) => {
    await runEntityWrite('wikiEntries', id, async () => {
      await storage.deleteEntity('wikiEntries', id);
      set((s) => ({ wikiEntries: s.wikiEntries.filter((e) => e.id !== id) }));
    });
  },
}));
