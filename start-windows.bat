@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"

echo ========================================
echo   墨笺 · 小说策划台 — Windows 启动向导
echo ========================================
echo.
echo 请选择适合你的启动方式：
echo   1^) 我熟悉开发环境（推荐使用 mise 管理 Node.js）
echo   2^) 我不熟悉开发环境（使用全局安装的 Node.js）
echo.
choice /C 12 /N /M "请输入 1 或 2: "
if errorlevel 2 goto GLOBAL_NODE
goto MISE

:MISE
echo.
echo [1/4] 已选择 mise 项目环境。
where mise >nul 2>nul
if not errorlevel 1 goto MISE_READY

echo 当前没有安装 mise。
where scoop >nul 2>nul
if not errorlevel 1 (
  choice /C YN /N /M "是否现在通过 Scoop 安装 mise？[Y/N]: "
  if errorlevel 2 goto MISE_HELP
  scoop install mise
  if errorlevel 1 goto INSTALL_FAILED
  goto CHECK_MISE_AGAIN
)

where winget >nul 2>nul
if not errorlevel 1 (
  choice /C YN /N /M "未找到 Scoop，是否改用 Winget 安装 mise？[Y/N]: "
  if errorlevel 2 goto MISE_HELP
  winget install jdx.mise
  if errorlevel 1 goto INSTALL_FAILED
  goto CHECK_MISE_AGAIN
)

goto MISE_HELP

:CHECK_MISE_AGAIN
where mise >nul 2>nul
if errorlevel 1 (
  echo mise 已安装，但当前窗口还没有刷新 PATH。
  echo 请关闭此窗口，然后重新双击本脚本。
  goto PAUSE_OK
)

:MISE_READY
echo.
echo [2/4] 正在准备项目指定的 Node.js 24 与 Rust 环境...
mise trust >nul 2>nul
mise install
if errorlevel 1 goto ENV_FAILED

if exist node_modules\.bin\tauri.cmd if exist node_modules\.bin\vite.cmd if exist node_modules\.bin\tsc.cmd (
  echo.
  echo [3/4] 已检测到项目依赖，跳过安装。
) else (
  echo.
  echo [3/4] 首次运行，正在安装项目依赖...
  mise exec -- npm install
  if errorlevel 1 goto DEPS_FAILED
)

call :CHECK_MISE_RUST
if errorlevel 1 goto RUST_HELP

echo.
echo [4/4] 启动墨笺桌面应用...
echo 停止服务时，请回到此窗口按 Ctrl+C。
echo.
mise exec -- npm run desktop:dev
if errorlevel 1 goto START_FAILED
goto END

:GLOBAL_NODE
echo.
echo [1/4] 已选择全局 Node.js 环境。
echo [2/4] 正在检查 Node.js...
where node >nul 2>nul
if errorlevel 1 goto NODE_HELP
where npm >nul 2>nul
if errorlevel 1 goto NODE_HELP

node -e "const [major,minor]=process.versions.node.split('.').map(Number);process.exit(major^>22^|^|(major===22^&^&minor^>=12)^|^|(major===20^&^&minor^>=19)?0:1)"
if errorlevel 1 goto NODE_HELP

for /f "delims=" %%V in ('node --version') do set NODE_VERSION=%%V
for /f "delims=" %%V in ('npm --version') do set NPM_VERSION=%%V
echo 检测通过：Node.js %NODE_VERSION%，npm %NPM_VERSION%

if exist node_modules\.bin\tauri.cmd if exist node_modules\.bin\vite.cmd if exist node_modules\.bin\tsc.cmd (
  echo.
  echo [3/4] 已检测到项目依赖，跳过安装。
) else (
  echo.
  echo [3/4] 首次运行，正在安装项目依赖...
  npm install
  if errorlevel 1 goto DEPS_FAILED
)

call :CHECK_RUST
if errorlevel 1 goto RUST_HELP

echo.
echo [4/4] 启动墨笺桌面应用...
echo 停止服务时，请回到此窗口按 Ctrl+C。
echo.
npm run desktop:dev
if errorlevel 1 goto START_FAILED
goto END

:NODE_HELP
echo.
echo 没有找到兼容的 Node.js。
echo 请安装 Node.js 24 LTS，然后重新双击本脚本。
echo 即将打开 Node.js 官方下载页面...
start "" "https://nodejs.org/en/download"
goto PAUSE_OK

:MISE_HELP
echo.
echo 请先按照 mise 官方说明完成安装，然后重新双击本脚本：
echo https://mise.jdx.dev/installing-mise.html
start "" "https://mise.jdx.dev/installing-mise.html"
goto PAUSE_OK

:RUST_HELP
echo.
echo 没有找到 Tauri 所需的 Rust 或 Cargo。
echo 请按照 rustup 官方说明安装 Rust，完成后重新双击本脚本：
echo https://rustup.rs/
start "" "https://rustup.rs/"
goto PAUSE_OK

:INSTALL_FAILED
echo.
echo mise 安装失败，请检查网络连接后重试。
goto PAUSE_ERROR

:ENV_FAILED
echo.
echo Node.js 环境安装失败，请检查网络连接和 mise 配置。
goto PAUSE_ERROR

:DEPS_FAILED
echo.
echo 项目依赖安装失败，请检查网络连接后重试。
goto PAUSE_ERROR

:START_FAILED
echo.
echo 开发服务器启动失败，请查看上方错误信息。
goto PAUSE_ERROR

:PAUSE_OK
echo.
pause
exit /b 0

:PAUSE_ERROR
echo.
pause
exit /b 1

:END
endlocal
exit /b 0

:CHECK_RUST
where rustc >nul 2>nul
if errorlevel 1 exit /b 1
where cargo >nul 2>nul
if errorlevel 1 exit /b 1
for /f "delims=" %%V in ('rustc --version') do set RUST_VERSION=%%V
for /f "delims=" %%V in ('cargo --version') do set CARGO_VERSION=%%V
echo 检测通过：%RUST_VERSION%，%CARGO_VERSION%
exit /b 0

:CHECK_MISE_RUST
mise exec -- rustc --version >nul 2>nul
if errorlevel 1 exit /b 1
mise exec -- cargo --version >nul 2>nul
if errorlevel 1 exit /b 1
for /f "delims=" %%V in ('mise exec -- rustc --version') do set RUST_VERSION=%%V
for /f "delims=" %%V in ('mise exec -- cargo --version') do set CARGO_VERSION=%%V
echo 检测通过：%RUST_VERSION%，%CARGO_VERSION%
exit /b 0
