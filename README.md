<div align="center">

# 墨笺 · Mojian Story Planner

**一个本地优先、可视化的小说策划工作台。**

用结构板、人物关系图、时间线、伏笔表和世界观百科，把复杂故事整理成清晰、可持续维护的创作系统。

[![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![Tauri](https://img.shields.io/badge/Tauri-2-24C8D8?logo=tauri&logoColor=white)](https://v2.tauri.app/)
[![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite&logoColor=white)](https://sqlite.org/)
[![License](https://img.shields.io/badge/License-MIT-8b5e3c.svg)](./LICENSE)

</div>

## 项目简介

墨笺不是正文生成器，而是一套面向长篇小说、剧本和复杂叙事创作的策划工具。它帮助创作者在正式写作前建立故事骨架，并在创作过程中持续检查人物关系、事件顺序、伏笔回收和世界观一致性。

项目采用本地优先设计，无需注册账号。桌面版使用用户目录中的 SQLite 数据库作为唯一主存储，并支持定时数据库备份、单作品 JSON 导出与恢复。

## 核心功能

| 模块 | 能力 |
| --- | --- |
| 故事结构板 | 创建、拖拽和连接章节卡片，记录摘要、关键情节、幕次与灵感片段 |
| 人物关系图 | 管理角色档案，通过不同关系类型构建人物网络 |
| 多轨时间线 | 按主线、支线或角色线组织事件，关联章节与参与角色 |
| 伏笔追踪 | 记录伏笔埋设、回收章节、状态与优先级，检查未闭合伏笔 |
| 世界观百科 | 管理人物、地点、物品、组织、概念和事件词条 |
| 本地数据管理 | 自动保存、作品切换、JSON 备份导出与完整恢复 |
| 体验能力 | 明暗主题、响应式布局、键盘焦点和按需加载 |

## 技术栈

- React 19 + TypeScript 6
- Vite 8
- Zustand：应用状态管理
- Tauri 2 + Rust：Windows/macOS 桌面应用与后台任务
- SQLite / rusqlite：桌面版主存储与一致性备份
- Dexie / IndexedDB：仅用于 `npm run dev` 的浏览器预览模式
- React Flow：故事结构板与人物关系图
- D3：可视化能力支持
- mise：可选的项目级 Node.js 环境管理

## 快速开始

### macOS

直接双击项目根目录中的：

```text
start-macos.command
```

启动向导会检查 Node.js、Rust 和 Cargo，然后启动 Tauri 桌面窗口。它也会询问你的 Node.js 使用方式：

1. 熟悉开发环境：推荐使用 mise 管理项目 Node.js 与 Rust 版本。
2. 不熟悉开发环境：使用电脑中全局安装的 Node.js。

如果系统提示没有执行权限：

```bash
chmod +x start-macos.command
./start-macos.command
```

### Windows

直接双击：

```text
start-windows.bat
```

技术用户可选择 mise，由项目配置自动安装 Node.js 与 Rust；普通用户可以使用全局 Node.js，并通过 [rustup](https://rustup.rs/) 安装 Rust。

在 Windows 本地编译桌面版还需要 Microsoft C++ Build Tools 与 WebView2；请参考 [Tauri Windows 前置要求](https://v2.tauri.app/start/prerequisites/#windows)。GitHub Actions 的 Windows runner 已预装对应构建环境。

### 手动启动

要求 Node.js `20.19+`、`22.12+` 或更新版本（推荐 Node.js 24 LTS），并安装当前稳定版 Rust 与对应平台的 Tauri 系统依赖。

```bash
git clone https://github.com/Starsrift/mojian-story-planner.git
cd mojian-story-planner
npm install
npm run desktop:dev
```

使用 mise：

```bash
mise install
mise run install
mise exec -- npm run desktop:dev
```

开发模式会自动打开墨笺桌面窗口。若只想预览前端界面，可以运行 `npm run dev`；此时页面会明确显示“浏览器预览”，数据只进入该浏览器的 IndexedDB。

## 构建

```bash
npm run build
npm run desktop:build
```

`npm run build` 仅构建 Web 前端；`npm run desktop:build` 会生成当前操作系统的桌面安装包。

## GitHub Release

仓库使用 `.github/workflows/release.yml` 自动生成以下安装包：

- macOS Apple Silicon DMG
- macOS Intel DMG
- Windows 10/11 x64 NSIS 安装程序

发布前请确保 `package.json`、`src-tauri/Cargo.toml` 和 `src-tauri/tauri.conf.json` 中的版本一致。推送完全相同的 `v<版本号>` 标签即可触发构建：

```bash
git tag v0.1.0
git push origin v0.1.0
```

也可以在 Actions 页面手动运行工作流，但必须填写与配置版本一致的标签。工作流会先校验三处版本和触发标签；任何一处不一致都会立即停止，避免把安装包上传到错误的 Release。之后才运行前端与 Rust 测试，创建 Draft Release 并上传安装包。请在 macOS 与 Windows 上分别下载安装验证，确认后再到 GitHub Release 页面公开发布。

当前 macOS 构建使用 ad-hoc 签名，Windows 构建未配置商业代码签名。首次测试发布时，系统可能要求用户在“隐私与安全性”中允许打开，或显示 SmartScreen 提示；正式公开发行前建议配置 Apple 公证和 Windows 代码签名。

## 数据与隐私

- Windows 与 macOS 桌面版都以 `~/.mojian/mojian.db` 作为作品数据的唯一主存储。
- 应用每小时检查备份状态；距离上次成功备份达到 48 小时时，在 `~/.mojian/backups/` 生成一致性的 SQLite 副本。
- 自动备份最多保留最近 30 份。备份使用 SQLite Online Backup API，不会直接复制正在写入的数据库文件。
- 首次启动且数据库为空、并且检测到 `~/.mojian/latest.json` 时，应用会自动导入该镜像；旧文件不会被删除。
- 纯浏览器旧版的 IndexedDB 无法由桌面应用直接读取。请先在旧版中选择“导出当前作品备份”，再在桌面版作品首页导入生成的 JSON。
- 项目不要求登录，也不会主动上传作品内容。
- 恢复备份时，墨笺会创建独立副本并重建章节、人物及关联关系，避免覆盖原作品。

### 跨平台数据目录

macOS 和 Windows 共用以下目录结构：

```text
~/.mojian/
├── mojian.db            # SQLite 主数据库
├── latest.json          # 可选旧版本地镜像，仅在首次迁移时读取
└── backups/
    └── mojian-backup-*.sqlite3  # 每 48 小时生成，最多保留 30 份
```

桌面版注册系统开机自启动。关闭主窗口后应用隐藏到系统托盘，备份检查仍会继续；从托盘菜单选择“退出”才会结束后台进程。自动备份是整个 SQLite 数据库副本，不通过浏览器，也不依赖浏览器是否打开。

如需从自动备份恢复，请先从系统托盘完全退出墨笺，另外保存当前 `mojian.db`，再选择一份 `.sqlite3` 备份复制为 `~/.mojian/mojian.db`。不要在应用运行时直接替换数据库。

### 从旧浏览器版升级

如果你的旧数据只存在 Chrome、Edge 或 Safari 的 IndexedDB 中：

1. 用原浏览器打开仍能看到作品的旧版墨笺。
2. 进入作品后，在左上角作品菜单中选择“导出当前作品备份”。
3. 启动桌面版，在作品首页导入下载的 `JSON` 文件。
4. 确认章节、人物、连线等内容无误后，再决定是否清理浏览器数据。

浏览器 IndexedDB 与 Tauri WebView 属于不同存储空间，因此桌面版不会宣称能自动接管纯浏览器数据。若此前已经生成 `~/.mojian/latest.json`，则无需手动导出，首次启动会按上一节规则自动导入。

## 项目结构

```text
src/
├── components/       # 结构板、人物图、时间线、伏笔表、百科等界面
├── db/               # 前端存储适配器与浏览器预览后备
├── store/            # Zustand 状态与业务操作
├── styles/           # 全局主题与响应式样式
├── types/            # 核心数据类型
└── App.tsx           # 应用入口与视图按需加载
src-tauri/
├── src/              # SQLite、迁移、备份、托盘与 Tauri 命令
├── capabilities/     # 桌面窗口权限
└── tauri.conf.json   # Windows/macOS 桌面构建配置
```

## 开源协作

欢迎提交 Issue 和 Pull Request。适合贡献的方向包括：

- Markdown 正文编辑与章节字数统计
- 更多故事结构模板
- 数据导入导出格式扩展
- 搜索、标签和全局关联
- 可访问性与移动端体验
- 自动化测试与国际化

提交前请运行：

```bash
npm run build
npm test
cargo test --manifest-path src-tauri/Cargo.toml
```

## License

本项目基于 [MIT License](./LICENSE) 开源。

## Star History

下图由仓库内的 GitHub Action 每日自动更新，横轴为日期，纵轴为累计 Star 数量。

![Mojian Story Planner Star History](./assets/star-history.svg)

<div align="center">

如果墨笺对你的创作有帮助，欢迎点一个 Star ⭐

</div>
