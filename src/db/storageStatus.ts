import type { PersistenceStatus, StorageStatus } from './storage'

export type StorageDescription = {
  label: string
  title: string
}

export function describeStorageStatus(
  status: StorageStatus,
  persistence: PersistenceStatus = { phase: 'saved', error: null },
): StorageDescription {
  const backendTitle = status.backend === 'indexeddb'
    ? '当前为浏览器预览模式，作品数据保存在此浏览器的 IndexedDB 中'
    : [
        status.databasePath ? `数据库：${status.databasePath}` : null,
        status.backupDirectory ? `备份目录：${status.backupDirectory}` : null,
        status.lastBackupAt ? `最近备份：${status.lastBackupAt}` : '尚未生成自动备份',
      ].filter((value): value is string => Boolean(value)).join('\n')

  if (persistence.phase === 'saving') {
    return {
      label: '正在保存…',
      title: ['正在写入本地存储', backendTitle].filter(Boolean).join('\n'),
    }
  }

  if (persistence.phase === 'error') {
    return {
      label: '保存失败',
      title: [`保存失败：${persistence.error}`, backendTitle].filter(Boolean).join('\n'),
    }
  }

  if (status.backend === 'indexeddb') {
    return {
      label: '浏览器预览',
      title: backendTitle,
    }
  }

  return {
    label: 'SQLite 已保存',
    title: backendTitle,
  }
}
