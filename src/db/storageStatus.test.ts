import { describe, expect, it } from 'vitest'
import { describeStorageStatus } from './storageStatus'

describe('describeStorageStatus', () => {
  it('labels the desktop backend as durable SQLite storage', () => {
    const description = describeStorageStatus({
      backend: 'sqlite',
      databasePath: '/Users/aether/.mojian/mojian.db',
      backupDirectory: '/Users/aether/.mojian/backups',
      lastBackupAt: '2026-07-13T08:00:00Z',
    })

    expect(description.label).toBe('SQLite 已保存')
    expect(description.title).toContain('/Users/aether/.mojian/mojian.db')
    expect(description.title).toContain('/Users/aether/.mojian/backups')
    expect(description.title).toContain('2026-07-13T08:00:00Z')
  })

  it('makes browser preview mode explicit', () => {
    expect(describeStorageStatus({ backend: 'indexeddb' })).toEqual({
      label: '浏览器预览',
      title: '当前为浏览器预览模式，作品数据保存在此浏览器的 IndexedDB 中',
    })
  })

  it('shows an in-progress mutation instead of claiming it is saved', () => {
    const description = describeStorageStatus(
      { backend: 'sqlite' },
      { phase: 'saving', error: null },
    )

    expect(description.label).toBe('正在保存…')
  })

  it('surfaces the persistence error in the status tooltip', () => {
    const description = describeStorageStatus(
      { backend: 'sqlite', databasePath: '/Users/aether/.mojian/mojian.db' },
      { phase: 'error', error: 'database is locked' },
    )

    expect(description.label).toBe('保存失败')
    expect(description.title).toContain('database is locked')
  })
})
