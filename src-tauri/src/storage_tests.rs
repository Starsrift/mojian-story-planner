use std::fs;

use chrono::{Duration, TimeZone, Utc};
use serde_json::json;
use tempfile::tempdir;

use crate::storage::StorageEngine;

fn project(id: &str, name: &str) -> serde_json::Value {
    json!({
        "id": id,
        "name": name,
        "description": "",
        "createdAt": 1_720_000_000_000_i64,
        "updatedAt": 1_720_000_000_000_i64
    })
}

fn card(id: &str, project_id: &str) -> serde_json::Value {
    json!({
        "id": id,
        "projectId": project_id,
        "title": "第一章",
        "summary": "",
        "keyPoints": "",
        "notes": "",
        "act": 1,
        "order": 0,
        "position": { "x": 100, "y": 100 },
        "color": "#8b5e3c",
        "createdAt": 1_720_000_000_000_i64,
        "updatedAt": 1_720_000_000_000_i64
    })
}

fn story_link(id: &str, project_id: &str, source: &str, target: &str) -> serde_json::Value {
    json!({
        "id": id,
        "projectId": project_id,
        "source": source,
        "target": target,
        "label": ""
    })
}

fn character(id: &str, project_id: &str) -> serde_json::Value {
    json!({
        "id": id,
        "projectId": project_id,
        "name": id,
        "aliases": [],
        "role": "配角",
        "description": "",
        "personality": "",
        "background": "",
        "position": { "x": 100, "y": 100 },
        "color": "#c4683f",
        "createdAt": 1_720_000_000_000_i64,
        "updatedAt": 1_720_000_000_000_i64
    })
}

fn relation(id: &str, project_id: &str, source: &str, target: &str) -> serde_json::Value {
    json!({
        "id": id,
        "projectId": project_id,
        "source": source,
        "target": target,
        "type": "盟友",
        "description": ""
    })
}

#[test]
fn persists_projects_and_entities_in_sqlite() {
    let root = tempdir().unwrap();
    let engine = StorageEngine::open(root.path().to_path_buf()).unwrap();

    engine.put_project(&project("project-1", "长夜")).unwrap();
    engine.put_entity("storyCards", &card("card-1", "project-1")).unwrap();

    assert_eq!(engine.list_projects().unwrap(), vec![project("project-1", "长夜")]);
    assert_eq!(
        engine.list_entities("storyCards", "project-1").unwrap(),
        vec![card("card-1", "project-1")]
    );
    assert!(root.path().join("mojian.db").is_file());
}

#[test]
fn rejects_unknown_entity_kind() {
    let root = tempdir().unwrap();
    let engine = StorageEngine::open(root.path().to_path_buf()).unwrap();
    engine.put_project(&project("project-1", "长夜")).unwrap();

    let error = engine.put_entity("secrets", &card("card-1", "project-1")).unwrap_err();

    assert!(error.contains("不支持的数据类型"));
}

#[test]
fn deleting_project_cascades_to_all_entities() {
    let root = tempdir().unwrap();
    let engine = StorageEngine::open(root.path().to_path_buf()).unwrap();
    engine.put_project(&project("project-1", "长夜")).unwrap();
    engine.put_entity("storyCards", &card("card-1", "project-1")).unwrap();

    engine.delete_project("project-1").unwrap();

    assert!(engine.list_projects().unwrap().is_empty());
    assert!(engine.list_entities("storyCards", "project-1").unwrap().is_empty());
}

#[test]
fn deleting_story_card_also_deletes_only_its_related_links() {
    let root = tempdir().unwrap();
    let engine = StorageEngine::open(root.path().to_path_buf()).unwrap();
    engine.put_project(&project("project-1", "长夜")).unwrap();
    engine.put_entity("storyCards", &card("card-1", "project-1")).unwrap();
    engine.put_entity("storyCards", &card("card-2", "project-1")).unwrap();
    engine.put_entity("storyCards", &card("card-3", "project-1")).unwrap();
    engine
        .put_entity(
            "storyLinks",
            &story_link("link-related", "project-1", "card-1", "card-2"),
        )
        .unwrap();
    engine
        .put_entity(
            "storyLinks",
            &story_link("link-unrelated", "project-1", "card-2", "card-3"),
        )
        .unwrap();

    engine.delete_story_card("card-1").unwrap();

    assert_eq!(
        engine.list_entities("storyCards", "project-1").unwrap().len(),
        2
    );
    assert_eq!(
        engine.list_entities("storyLinks", "project-1").unwrap(),
        vec![story_link(
            "link-unrelated",
            "project-1",
            "card-2",
            "card-3"
        )]
    );
}

#[test]
fn story_card_aggregate_delete_rolls_back_when_the_final_delete_fails() {
    let root = tempdir().unwrap();
    let engine = StorageEngine::open(root.path().to_path_buf()).unwrap();
    engine.put_project(&project("project-1", "长夜")).unwrap();
    engine.put_entity("storyCards", &card("card-1", "project-1")).unwrap();
    engine.put_entity("storyCards", &card("card-2", "project-1")).unwrap();
    engine
        .put_entity(
            "storyLinks",
            &story_link("link-1", "project-1", "card-1", "card-2"),
        )
        .unwrap();
    engine
        .execute_test_sql(
            "
            CREATE TRIGGER fail_story_card_delete
            BEFORE DELETE ON entities
            WHEN OLD.kind = 'storyCards' AND OLD.id = 'card-1'
            BEGIN
                SELECT RAISE(ABORT, 'injected delete failure');
            END;
            ",
        )
        .unwrap();

    assert!(engine.delete_story_card("card-1").is_err());

    assert_eq!(
        engine.list_entities("storyCards", "project-1").unwrap().len(),
        2
    );
    assert_eq!(
        engine.list_entities("storyLinks", "project-1").unwrap(),
        vec![story_link("link-1", "project-1", "card-1", "card-2")]
    );
}

#[test]
fn deleting_character_also_deletes_only_its_related_relations() {
    let root = tempdir().unwrap();
    let engine = StorageEngine::open(root.path().to_path_buf()).unwrap();
    engine.put_project(&project("project-1", "长夜")).unwrap();
    for id in ["character-1", "character-2", "character-3"] {
        engine
            .put_entity("characters", &character(id, "project-1"))
            .unwrap();
    }
    engine
        .put_entity(
            "relations",
            &relation(
                "relation-related",
                "project-1",
                "character-1",
                "character-2",
            ),
        )
        .unwrap();
    engine
        .put_entity(
            "relations",
            &relation(
                "relation-unrelated",
                "project-1",
                "character-2",
                "character-3",
            ),
        )
        .unwrap();

    engine.delete_character("character-1").unwrap();

    assert_eq!(
        engine.list_entities("characters", "project-1").unwrap().len(),
        2
    );
    assert_eq!(
        engine.list_entities("relations", "project-1").unwrap(),
        vec![relation(
            "relation-unrelated",
            "project-1",
            "character-2",
            "character-3"
        )]
    );
}

#[test]
fn migrates_legacy_local_snapshot_only_into_an_empty_database() {
    let root = tempdir().unwrap();
    let snapshot = json!({
        "format": "mojian-local-snapshot",
        "version": 1,
        "projects": [{
            "format": "mojian-project",
            "version": 1,
            "project": project("project-1", "旧作"),
            "data": {
                "storyCards": [card("card-1", "project-1")],
                "storyLinks": [],
                "characters": [],
                "relations": [],
                "timelineEvents": [],
                "foreshadows": [],
                "wikiEntries": []
            }
        }]
    });
    fs::write(
        root.path().join("latest.json"),
        serde_json::to_vec_pretty(&snapshot).unwrap(),
    )
    .unwrap();

    let engine = StorageEngine::open(root.path().to_path_buf()).unwrap();
    assert!(engine.migrate_legacy_snapshot().unwrap());
    assert_eq!(engine.list_projects().unwrap().len(), 1);
    assert_eq!(engine.list_entities("storyCards", "project-1").unwrap().len(), 1);

    engine.put_project(&project("project-2", "新作")).unwrap();
    assert!(!engine.migrate_legacy_snapshot().unwrap());
    assert_eq!(engine.list_projects().unwrap().len(), 2);
}

#[test]
fn creates_readable_backups_only_when_48_hours_have_elapsed() {
    let root = tempdir().unwrap();
    let engine = StorageEngine::open(root.path().to_path_buf()).unwrap();
    engine.put_project(&project("project-1", "长夜")).unwrap();
    let first_at = Utc.with_ymd_and_hms(2026, 7, 13, 8, 0, 0).unwrap();

    let first = engine.backup_if_due_at(first_at).unwrap().unwrap();
    assert!(first.is_file());
    assert_eq!(engine.read_projects_from_backup(&first).unwrap().len(), 1);

    let too_early = engine.backup_if_due_at(first_at + Duration::hours(47)).unwrap();
    assert!(too_early.is_none());

    let second = engine.backup_if_due_at(first_at + Duration::hours(48)).unwrap();
    assert!(second.is_some());
}

#[test]
fn keeps_only_the_30_newest_backups() {
    let root = tempdir().unwrap();
    let engine = StorageEngine::open(root.path().to_path_buf()).unwrap();
    engine.put_project(&project("project-1", "长夜")).unwrap();
    fs::create_dir_all(engine.backups_dir()).unwrap();
    for index in 0..31 {
        fs::write(
            engine.backups_dir().join(format!("mojian-backup-202607{:02}T000000Z.sqlite3", index + 1)),
            b"old",
        )
        .unwrap();
    }

    engine
        .backup_now_at(Utc.with_ymd_and_hms(2026, 8, 13, 8, 0, 0).unwrap())
        .unwrap();

    let backup_count = fs::read_dir(engine.backups_dir())
        .unwrap()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_name().to_string_lossy().starts_with("mojian-backup-"))
        .count();
    assert_eq!(backup_count, 30);
}
