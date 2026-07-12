import Dexie, { type Table } from 'dexie';
import type {
  Project, StoryCard, StoryLink, Character, CharacterRelation,
  TimelineEvent, Foreshadow, WikiEntry
} from '../types';

export class NovelDB extends Dexie {
  projects!: Table<Project, string>;
  storyCards!: Table<StoryCard, string>;
  storyLinks!: Table<StoryLink, string>;
  characters!: Table<Character, string>;
  relations!: Table<CharacterRelation, string>;
  timelineEvents!: Table<TimelineEvent, string>;
  foreshadows!: Table<Foreshadow, string>;
  wikiEntries!: Table<WikiEntry, string>;

  constructor() {
    super('mojian_db');
    this.version(1).stores({
      projects: 'id, name, updatedAt',
      storyCards: 'id, projectId, order, act',
      storyLinks: 'id, projectId, source, target',
      characters: 'id, projectId, name',
      relations: 'id, projectId, source, target',
      timelineEvents: 'id, projectId, track, order',
      foreshadows: 'id, projectId, status, priority',
      wikiEntries: 'id, projectId, name, type',
    });
  }
}

export const db = new NovelDB();

/** 生成 UUID */
export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}
