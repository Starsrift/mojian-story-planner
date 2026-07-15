<div align="center">

# 墨笺 · Mojian Story Planner

**一个本地优先、可视化的小说策划工作台。**

用结构板、人物关系图、时间线、伏笔表和世界观百科，把复杂故事整理成清晰、可持续维护的创作系统。

[![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![License](https://img.shields.io/badge/License-MIT-8b5e3c.svg)](./LICENSE)

</div>

## 项目简介

墨笺不是正文生成器，而是一套面向长篇小说、剧本和复杂叙事创作的策划工具。它帮助创作者在正式写作前建立故事骨架，并在创作过程中持续检查人物关系、事件顺序、伏笔回收和世界观一致性。

项目采用本地优先设计，无需注册账号。所有作品默认保存在当前运行环境的 IndexedDB profile 中，并支持 JSON 备份导出与恢复。

## 核心功能

| 模块 | 能力 |
| --- | --- |
| 作品总览 | 汇总章节、角色、时间线、伏笔和百科进度，提示下一步需要补全的内容 |
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
- Dexie / IndexedDB：浏览器与 Electron 本地持久化
- React Flow：故事结构板与人物关系图
- D3：可视化能力支持
- mise：可选的项目级 Node.js 环境管理

## Release 安装说明

推送版本标签后，Release 会提供以下构建产物：

- Windows x64：`.exe` 安装器和 `.zip` 压缩包。
- macOS：原生 `.dmg` 安装器和 `.zip` 压缩包，架构为 `arm64` 或 `x64`。
- Web fallback：`mojian-story-planner-<version>-web-any.zip`，压缩包内包含 `dist/`。
- `SHA256SUMS.txt`：覆盖 Windows `.exe`、macOS `.dmg`、Windows/macOS 平台 `.zip` 和 Web `.zip` 这些主要产物的 SHA-256 校验和清单；不包括可选的 `.blockmap` 文件。

桌面产物命名格式为 `mojian-story-planner-<version>-<platform>-<arch>.<ext>`。当前构建在未配置签名 secrets 时为未签名版本，Windows 可能触发 SmartScreen，macOS 可能触发 Gatekeeper。签名与 notarization 是否启用取决于发布环境配置；SHA-256 只能帮助确认下载内容未被更改，不能替代受信任的代码签名。

下载后可先校验文件，再按系统使用对应产物：

- Windows `.exe`：运行安装器；Windows `.zip`：解压后运行其中包含的桌面应用可执行文件。
- macOS `.dmg`：打开磁盘映像并按系统提示安装；macOS `.zip`：解压得到 `.app`，然后打开或移动到合适的位置。
- Web `.zip`：只解压其中的 `dist/`，再通过 HTTP 或静态托管服务提供。

Windows PowerShell：

```powershell
Get-FileHash .\mojian-story-planner-1.2.0-win-x64.exe -Algorithm SHA256
```

macOS：

```bash
shasum -a 256 mojian-story-planner-1.2.0-mac-arm64.dmg
```

将输出的哈希值与 `SHA256SUMS.txt` 中对应文件的值比较。Web fallback 不是桌面安装器，直接双击 `index.html` 不是可靠的使用方式。

## 快速开始

下面的启动脚本和手动启动命令仅适用于源码检出目录，不适用于 Release 平台 ZIP 或 Web ZIP。Release 产物请按上面的安装说明使用。

### macOS

直接双击项目根目录中的：

```text
start-macos.command
```

启动向导会询问你的使用方式：

1. 熟悉开发环境：推荐使用 mise 管理项目 Node.js 版本。
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

技术用户可选择 mise；普通用户可以直接使用全局 Node.js。

如果源码目录中的脚本没有反应，可在项目目录中打开 PowerShell 或终端，执行手动启动命令。

### 手动启动

要求 Node.js `20.19+`、`22.12+` 或更新版本，推荐 Node.js 24 LTS。

```bash
git clone https://github.com/Starsrift/mojian-story-planner.git
cd mojian-story-planner
npm install
npm run dev
```

使用 mise：

```bash
mise install
mise run install
mise run dev
```

浏览器访问终端中显示的本地地址即可。

## 开发、测试与构建

安装依赖后，可使用以下命令：

```bash
npm install
npm run dev             # 浏览器开发服务
npm run build && npm run preview  # 先构建，再预览生产构建
npm run electron:dev   # Electron 开发模式
```

测试命令：

```bash
npm run test:run        # 单元测试及浏览器环境测试
npm run test:electron   # Electron 测试
```

构建命令：

```bash
npm run build           # Web 应用，输出到 dist/
npm run build:electron  # Electron 主进程与 preload，输出到 dist-electron/
```

原生桌面打包必须在目标操作系统上执行：

```bash
npm run dist:win        # 原生 Windows x64 .exe 和 .zip
npm run dist:mac        # 原生 macOS .dmg 和 .zip
npm run electron:build  # 当前宿主系统的完整桌面打包（安装器 + 压缩包）
```

版本标签发布由 CI 负责生成并上传 Release 产物；本地打包结果默认写入 `release/`。

## 数据与隐私

- 浏览器和 Electron 使用相互独立的 IndexedDB profile，数据不会自动复制或同步。
- 项目不要求登录，也不会主动上传作品内容。
- 清理浏览器站点数据前，请先从作品菜单导出 JSON 备份。
- 在浏览器与 Electron 之间迁移时，请在来源环境导出 JSON，再在目标环境导入；两个方向均使用现有的 JSON 导出/导入功能。
- 恢复备份时，墨笺会创建独立副本并重建章节、人物及关联关系，避免覆盖原作品。

## 项目结构

```text
src/
├── components/       # 结构板、人物图、时间线、伏笔表、百科等界面
├── db/               # Dexie / IndexedDB 数据库
├── store/            # Zustand 状态与业务操作
├── styles/           # 全局主题与响应式样式
├── types/            # 核心数据类型
└── App.tsx           # 应用入口与视图按需加载
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
```

## License

本项目基于 [MIT License](./LICENSE) 开源。

## Star History

下图由仓库内的 GitHub Action 每日自动更新，横轴为日期，纵轴为累计 Star 数量。

![Mojian Story Planner Star History](./assets/star-history.svg)

<div align="center">

如果墨笺对你的创作有帮助，欢迎点一个 Star ⭐

</div>
