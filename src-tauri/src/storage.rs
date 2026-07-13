use std::{
    fs,
    path::{Path, PathBuf},
    time::Duration as StdDuration,
};

use chrono::{DateTime, Duration, SecondsFormat, Utc};
use rusqlite::{backup::Backup, params, Connection, OptionalExtension, Transaction};
use serde::Serialize;
use serde_json::Value;

const ENTITY_KINDS: [&str; 7] = [
    "storyCards",
    "storyLinks",
    "characters",
    "relations",
    "timelineEvents",
    "foreshadows",
    "wikiEntries",
];
const BACKUP_INTERVAL_HOURS: i64 = 48;
const BACKUP_RETENTION: usize = 30;

type StorageResult<T> = Result<T, String>;

#[derive(Clone, Debug)]
pub struct StorageEngine {
    root_dir: PathBuf,
    database_path: PathBuf,
    backups_dir: PathBuf,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageStatus {
    pub backend: &'static str,
    pub database_path: String,
    pub backup_directory: String,
    pub last_backup_at: Option<String>,
}

impl StorageEngine {
    pub fn open(root_dir: PathBuf) -> StorageResult<Self> {
        fs::create_dir_all(&root_dir)
            .map_err(|error| format!("无法创建墨笺数据目录：{error}"))?;
        let backups_dir = root_dir.join("backups");
        fs::create_dir_all(&backups_dir)
            .map_err(|error| format!("无法创建墨笺备份目录：{error}"))?;

        let engine = Self {
            database_path: root_dir.join("mojian.db"),
            root_dir,
            backups_dir,
        };
        let connection = Connection::open(&engine.database_path)
            .map_err(|error| format!("无法打开墨笺数据库：{error}"))?;
        connection
            .execute_batch(
                "
                PRAGMA foreign_keys = ON;
                PRAGMA journal_mode = WAL;
                PRAGMA synchronous = NORMAL;
                PRAGMA busy_timeout = 5000;

                CREATE TABLE IF NOT EXISTS projects (
                    id TEXT PRIMARY KEY,
                    updated_at INTEGER NOT NULL,
                    json TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS entities (
                    kind TEXT NOT NULL,
                    id TEXT NOT NULL,
                    project_id TEXT NOT NULL,
                    sort_order INTEGER,
                    json TEXT NOT NULL,
                    PRIMARY KEY (kind, id),
                    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_entities_project_kind
                    ON entities(project_id, kind, sort_order);

                CREATE TABLE IF NOT EXISTS metadata (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
                ",
            )
            .map_err(|error| format!("无法初始化墨笺数据库：{error}"))?;

        Ok(engine)
    }

    fn connection(&self) -> StorageResult<Connection> {
        let connection = Connection::open(&self.database_path)
            .map_err(|error| format!("无法打开墨笺数据库：{error}"))?;
        connection
            .execute_batch("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;")
            .map_err(|error| format!("无法配置墨笺数据库连接：{error}"))?;
        Ok(connection)
    }

    pub fn backups_dir(&self) -> &Path {
        &self.backups_dir
    }

    pub fn list_projects(&self) -> StorageResult<Vec<Value>> {
        let connection = self.connection()?;
        let mut statement = connection
            .prepare("SELECT json FROM projects ORDER BY updated_at DESC, id ASC")
            .map_err(|error| format!("无法读取作品列表：{error}"))?;
        let rows = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|error| format!("无法读取作品列表：{error}"))?;
        let serialized = rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("无法读取作品列表：{error}"))?;
        parse_json_rows(serialized, "作品")
    }

    pub fn put_project(&self, project: &Value) -> StorageResult<()> {
        let id = required_string(project, "id", "作品")?;
        let updated_at = required_i64(project, "updatedAt", "作品")?;
        let serialized = serde_json::to_string(project)
            .map_err(|error| format!("无法序列化作品：{error}"))?;
        let connection = self.connection()?;
        connection
            .execute(
                "
                INSERT INTO projects(id, updated_at, json)
                VALUES (?1, ?2, ?3)
                ON CONFLICT(id) DO UPDATE SET
                    updated_at = excluded.updated_at,
                    json = excluded.json
                ",
                params![id, updated_at, serialized],
            )
            .map_err(|error| format!("无法保存作品：{error}"))?;
        Ok(())
    }

    pub fn delete_project(&self, project_id: &str) -> StorageResult<()> {
        let connection = self.connection()?;
        connection
            .execute("DELETE FROM projects WHERE id = ?1", [project_id])
            .map_err(|error| format!("无法删除作品：{error}"))?;
        Ok(())
    }

    pub fn list_entities(&self, kind: &str, project_id: &str) -> StorageResult<Vec<Value>> {
        validate_kind(kind)?;
        let connection = self.connection()?;
        let mut statement = connection
            .prepare(
                "
                SELECT json
                FROM entities
                WHERE kind = ?1 AND project_id = ?2
                ORDER BY
                    CASE WHEN sort_order IS NULL THEN 1 ELSE 0 END,
                    sort_order ASC,
                    rowid ASC
                ",
            )
            .map_err(|error| format!("无法读取作品数据：{error}"))?;
        let rows = statement
            .query_map(params![kind, project_id], |row| row.get::<_, String>(0))
            .map_err(|error| format!("无法读取作品数据：{error}"))?;
        let serialized = rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("无法读取作品数据：{error}"))?;
        parse_json_rows(serialized, "作品数据")
    }

    pub fn put_entity(&self, kind: &str, entity: &Value) -> StorageResult<()> {
        validate_kind(kind)?;
        let connection = self.connection()?;
        insert_entity(&connection, kind, entity)
    }

    pub fn delete_entity(&self, kind: &str, id: &str) -> StorageResult<()> {
        validate_kind(kind)?;
        let connection = self.connection()?;
        connection
            .execute(
                "DELETE FROM entities WHERE kind = ?1 AND id = ?2",
                params![kind, id],
            )
            .map_err(|error| format!("无法删除作品数据：{error}"))?;
        Ok(())
    }

    pub fn delete_story_card(&self, id: &str) -> StorageResult<()> {
        self.delete_entity_with_dependents("storyCards", id, "storyLinks", "章节")
    }

    pub fn delete_character(&self, id: &str) -> StorageResult<()> {
        self.delete_entity_with_dependents("characters", id, "relations", "角色")
    }

    pub fn import_project_bundle(&self, bundle: &Value) -> StorageResult<()> {
        let mut connection = self.connection()?;
        let transaction = connection
            .transaction()
            .map_err(|error| format!("无法开始导入作品：{error}"))?;
        insert_bundle(&transaction, bundle)?;
        transaction
            .commit()
            .map_err(|error| format!("无法完成作品导入：{error}"))?;
        Ok(())
    }

    pub fn migrate_legacy_snapshot(&self) -> StorageResult<bool> {
        if self.project_count()? > 0 {
            return Ok(false);
        }

        let snapshot_path = self.root_dir.join("latest.json");
        if !snapshot_path.is_file() {
            return Ok(false);
        }
        let raw = fs::read_to_string(&snapshot_path)
            .map_err(|error| format!("无法读取旧版本地镜像：{error}"))?;
        let snapshot: Value = serde_json::from_str(&raw)
            .map_err(|error| format!("旧版本地镜像不是有效 JSON：{error}"))?;
        if snapshot.get("format").and_then(Value::as_str) != Some("mojian-local-snapshot") {
            return Err("旧版本地镜像格式不受支持".to_string());
        }
        let bundles = snapshot
            .get("projects")
            .and_then(Value::as_array)
            .ok_or_else(|| "旧版本地镜像缺少作品列表".to_string())?;
        if bundles.is_empty() {
            return Ok(false);
        }

        let mut connection = self.connection()?;
        let transaction = connection
            .transaction()
            .map_err(|error| format!("无法开始旧数据迁移：{error}"))?;
        for bundle in bundles {
            insert_bundle(&transaction, bundle)?;
        }
        transaction
            .execute(
                "
                INSERT INTO metadata(key, value) VALUES ('legacy_migrated_at', ?1)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
                ",
                [Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true)],
            )
            .map_err(|error| format!("无法记录旧数据迁移状态：{error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("无法完成旧数据迁移：{error}"))?;
        Ok(true)
    }

    pub fn backup_if_due(&self) -> StorageResult<Option<PathBuf>> {
        self.backup_if_due_at(Utc::now())
    }

    pub fn backup_if_due_at(&self, now: DateTime<Utc>) -> StorageResult<Option<PathBuf>> {
        if self.project_count()? == 0 {
            return Ok(None);
        }
        if let Some(last_backup_at) = self.last_backup_at()? {
            let last_backup = DateTime::parse_from_rfc3339(&last_backup_at)
                .map_err(|error| format!("最近备份时间无效：{error}"))?
                .with_timezone(&Utc);
            if now.signed_duration_since(last_backup) < Duration::hours(BACKUP_INTERVAL_HOURS) {
                return Ok(None);
            }
        }
        self.backup_now_at(now).map(Some)
    }

    pub fn backup_now(&self) -> StorageResult<PathBuf> {
        self.backup_now_at(Utc::now())
    }

    pub fn backup_now_at(&self, now: DateTime<Utc>) -> StorageResult<PathBuf> {
        fs::create_dir_all(&self.backups_dir)
            .map_err(|error| format!("无法创建备份目录：{error}"))?;
        let timestamp = now.format("%Y%m%dT%H%M%S%.3fZ");
        let file_name = format!("mojian-backup-{timestamp}.sqlite3");
        let destination = self.backups_dir.join(&file_name);
        let temporary = self.backups_dir.join(format!(".{file_name}.tmp"));
        if temporary.exists() {
            fs::remove_file(&temporary)
                .map_err(|error| format!("无法清理未完成的备份：{error}"))?;
        }

        let source = self.connection()?;
        let mut target = Connection::open(&temporary)
            .map_err(|error| format!("无法创建备份数据库：{error}"))?;
        {
            let backup = Backup::new(&source, &mut target)
                .map_err(|error| format!("无法开始数据库备份：{error}"))?;
            backup
                .run_to_completion(32, StdDuration::from_millis(25), None)
                .map_err(|error| format!("无法完成数据库备份：{error}"))?;
        }
        drop(target);
        drop(source);

        let integrity_connection = Connection::open(&temporary)
            .map_err(|error| format!("无法检查备份数据库：{error}"))?;
        let integrity: String = integrity_connection
            .query_row("PRAGMA integrity_check", [], |row| row.get(0))
            .map_err(|error| format!("无法检查备份完整性：{error}"))?;
        drop(integrity_connection);
        if integrity != "ok" {
            let _ = fs::remove_file(&temporary);
            return Err(format!("备份完整性检查失败：{integrity}"));
        }

        fs::rename(&temporary, &destination)
            .map_err(|error| format!("无法保存数据库备份：{error}"))?;
        self.set_metadata(
            "last_backup_at",
            &now.to_rfc3339_opts(SecondsFormat::Secs, true),
        )?;
        self.prune_backups()?;
        Ok(destination)
    }

    pub fn status(&self) -> StorageResult<StorageStatus> {
        Ok(StorageStatus {
            backend: "sqlite",
            database_path: self.database_path.to_string_lossy().into_owned(),
            backup_directory: self.backups_dir.to_string_lossy().into_owned(),
            last_backup_at: self.last_backup_at()?,
        })
    }

    fn project_count(&self) -> StorageResult<i64> {
        let connection = self.connection()?;
        connection
            .query_row("SELECT COUNT(*) FROM projects", [], |row| row.get(0))
            .map_err(|error| format!("无法统计作品数量：{error}"))
    }

    fn delete_entity_with_dependents(
        &self,
        kind: &str,
        id: &str,
        dependent_kind: &str,
        label: &str,
    ) -> StorageResult<()> {
        validate_kind(kind)?;
        validate_kind(dependent_kind)?;
        let mut connection = self.connection()?;
        let transaction = connection
            .transaction()
            .map_err(|error| format!("无法开始删除{label}：{error}"))?;
        let project_id = transaction
            .query_row(
                "SELECT project_id FROM entities WHERE kind = ?1 AND id = ?2",
                params![kind, id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|error| format!("无法读取待删除{label}：{error}"))?;

        if let Some(project_id) = project_id {
            transaction
                .execute(
                    "
                    DELETE FROM entities
                    WHERE kind = ?1
                      AND project_id = ?2
                      AND (
                        json_extract(json, '$.source') = ?3
                        OR json_extract(json, '$.target') = ?3
                      )
                    ",
                    params![dependent_kind, project_id, id],
                )
                .map_err(|error| format!("无法删除{label}关联数据：{error}"))?;
            transaction
                .execute(
                    "DELETE FROM entities WHERE kind = ?1 AND id = ?2",
                    params![kind, id],
                )
                .map_err(|error| format!("无法删除{label}：{error}"))?;
        }

        transaction
            .commit()
            .map_err(|error| format!("无法完成{label}删除：{error}"))?;
        Ok(())
    }

    fn last_backup_at(&self) -> StorageResult<Option<String>> {
        let connection = self.connection()?;
        connection
            .query_row(
                "SELECT value FROM metadata WHERE key = 'last_backup_at'",
                [],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| format!("无法读取最近备份时间：{error}"))
    }

    fn set_metadata(&self, key: &str, value: &str) -> StorageResult<()> {
        let connection = self.connection()?;
        connection
            .execute(
                "
                INSERT INTO metadata(key, value) VALUES (?1, ?2)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
                ",
                params![key, value],
            )
            .map_err(|error| format!("无法更新本地存储状态：{error}"))?;
        Ok(())
    }

    fn prune_backups(&self) -> StorageResult<()> {
        let mut backups = fs::read_dir(&self.backups_dir)
            .map_err(|error| format!("无法读取备份目录：{error}"))?
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .filter(|path| {
                path.file_name()
                    .and_then(|name| name.to_str())
                    .is_some_and(|name| {
                        name.starts_with("mojian-backup-") && name.ends_with(".sqlite3")
                    })
            })
            .collect::<Vec<_>>();
        backups.sort();
        let remove_count = backups.len().saturating_sub(BACKUP_RETENTION);
        for path in backups.into_iter().take(remove_count) {
            fs::remove_file(&path).map_err(|error| {
                format!("无法清理旧备份 {}：{error}", path.to_string_lossy())
            })?;
        }
        Ok(())
    }

    #[cfg(test)]
    pub fn read_projects_from_backup(&self, path: &Path) -> StorageResult<Vec<Value>> {
        let connection = Connection::open(path)
            .map_err(|error| format!("无法打开测试备份：{error}"))?;
        let mut statement = connection
            .prepare("SELECT json FROM projects ORDER BY updated_at DESC, id ASC")
            .map_err(|error| format!("无法读取测试备份：{error}"))?;
        let rows = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|error| format!("无法读取测试备份：{error}"))?;
        let serialized = rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("无法读取测试备份：{error}"))?;
        parse_json_rows(serialized, "测试备份")
    }

    #[cfg(test)]
    pub fn execute_test_sql(&self, sql: &str) -> StorageResult<()> {
        self.connection()?
            .execute_batch(sql)
            .map_err(|error| format!("无法准备测试数据库：{error}"))
    }
}

fn validate_kind(kind: &str) -> StorageResult<()> {
    if ENTITY_KINDS.contains(&kind) {
        Ok(())
    } else {
        Err(format!("不支持的数据类型：{kind}"))
    }
}

fn required_string<'a>(value: &'a Value, key: &str, label: &str) -> StorageResult<&'a str> {
    value
        .get(key)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| format!("{label}缺少 {key}"))
}

fn required_i64(value: &Value, key: &str, label: &str) -> StorageResult<i64> {
    value
        .get(key)
        .and_then(|value| {
            value
                .as_i64()
                .or_else(|| value.as_u64().and_then(|number| i64::try_from(number).ok()))
        })
        .ok_or_else(|| format!("{label}缺少 {key}"))
}

fn parse_json_rows(rows: Vec<String>, label: &str) -> StorageResult<Vec<Value>> {
    rows.into_iter()
        .map(|raw| {
            serde_json::from_str(&raw).map_err(|error| format!("{label}内容损坏：{error}"))
        })
        .collect()
}

fn insert_project(connection: &Connection, project: &Value) -> StorageResult<()> {
    let id = required_string(project, "id", "作品")?;
    let updated_at = required_i64(project, "updatedAt", "作品")?;
    let serialized = serde_json::to_string(project)
        .map_err(|error| format!("无法序列化作品：{error}"))?;
    connection
        .execute(
            "
            INSERT INTO projects(id, updated_at, json)
            VALUES (?1, ?2, ?3)
            ON CONFLICT(id) DO UPDATE SET
                updated_at = excluded.updated_at,
                json = excluded.json
            ",
            params![id, updated_at, serialized],
        )
        .map_err(|error| format!("无法导入作品：{error}"))?;
    Ok(())
}

fn insert_entity(connection: &Connection, kind: &str, entity: &Value) -> StorageResult<()> {
    validate_kind(kind)?;
    let id = required_string(entity, "id", "作品数据")?;
    let project_id = required_string(entity, "projectId", "作品数据")?;
    let sort_order = entity.get("order").and_then(Value::as_i64);
    let serialized = serde_json::to_string(entity)
        .map_err(|error| format!("无法序列化作品数据：{error}"))?;
    connection
        .execute(
            "
            INSERT INTO entities(kind, id, project_id, sort_order, json)
            VALUES (?1, ?2, ?3, ?4, ?5)
            ON CONFLICT(kind, id) DO UPDATE SET
                project_id = excluded.project_id,
                sort_order = excluded.sort_order,
                json = excluded.json
            ",
            params![kind, id, project_id, sort_order, serialized],
        )
        .map_err(|error| format!("无法保存作品数据：{error}"))?;
    Ok(())
}

fn insert_bundle(transaction: &Transaction<'_>, bundle: &Value) -> StorageResult<()> {
    let project = bundle
        .get("project")
        .ok_or_else(|| "作品备份缺少 project".to_string())?;
    let project_id = required_string(project, "id", "作品")?;
    insert_project(transaction, project)?;
    let data = bundle
        .get("data")
        .and_then(Value::as_object)
        .ok_or_else(|| "作品备份缺少 data".to_string())?;

    for kind in ENTITY_KINDS {
        let Some(entities) = data.get(kind) else {
            continue;
        };
        let entities = entities
            .as_array()
            .ok_or_else(|| format!("作品备份中的 {kind} 不是数组"))?;
        for entity in entities {
            let entity_project_id = required_string(entity, "projectId", "作品数据")?;
            if entity_project_id != project_id {
                return Err(format!("作品数据 {kind} 的 projectId 与作品不一致"));
            }
            insert_entity(transaction, kind, entity)?;
        }
    }
    Ok(())
}
