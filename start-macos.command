#!/bin/zsh

set -u

PROJECT_DIR="${0:A:h}"
cd "$PROJECT_DIR" || exit 1

# rustup 会把 Cargo 环境写到这里；双击 .command 时主动加载，避免新终端找不到 rustc/cargo。
if [[ -f "$HOME/.cargo/env" ]]; then
  source "$HOME/.cargo/env"
fi

pause_and_exit() {
  local code="${1:-1}"
  echo
  read "?按回车键关闭窗口..."
  exit "$code"
}

install_dependencies_if_needed() {
  local runner=("$@")
  local needs_install=0

  if [[ ! -d node_modules || ! -f node_modules/.package-lock.json ]]; then
    needs_install=1
  elif [[ package-lock.json -nt node_modules/.package-lock.json ]]; then
    needs_install=1
  fi

  if [[ $needs_install -eq 1 ]]; then
    echo
    echo "[3/4] 首次运行或依赖已更新，正在安装项目依赖..."
    "${runner[@]}" npm install || {
      echo "依赖安装失败，请检查网络连接后重试。"
      pause_and_exit 1
    }
  else
    echo
    echo "[3/4] 已检测到项目依赖，跳过安装。"
  fi

  # 修复从压缩包或非 Unix 文件系统复制项目后可能丢失的执行权限。
  local binary
  for binary in \
    node_modules/.bin/tsc \
    node_modules/.bin/vite \
    node_modules/typescript/bin/tsc \
    node_modules/vite/bin/vite.js; do
    [[ -f "$binary" ]] && chmod +x "$binary"
  done
}

check_global_node() {
  if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    return 1
  fi

  node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 12) || (major === 20 && minor >= 19) ? 0 : 1)'
}

check_rust_toolchain() {
  local runner=("$@")
  if [[ ${#runner[@]} -gt 0 ]]; then
    "${runner[@]}" rustc --version >/dev/null 2>&1 && \
      "${runner[@]}" cargo --version >/dev/null 2>&1
    return $?
  fi

  command -v rustc >/dev/null 2>&1 && command -v cargo >/dev/null 2>&1
}

ensure_rust_toolchain() {
  local runner=("$@")
  echo
  echo "正在检查 Tauri 所需的 Rust 工具链..."
  if check_rust_toolchain "${runner[@]}"; then
    if [[ ${#runner[@]} -gt 0 ]]; then
      echo "检测通过：$("${runner[@]}" rustc --version)，$("${runner[@]}" cargo --version)"
    else
      echo "检测通过：$(rustc --version)，$(cargo --version)"
    fi
    return 0
  fi

  echo "没有找到 Rust 或 Cargo。"
  echo "请按照 rustup 官方说明安装 Rust，完成后重新双击本脚本。"
  open "https://rustup.rs/" >/dev/null 2>&1 || true
  return 1
}

echo "========================================"
echo "  墨笺 · 小说策划台 — macOS 启动向导"
echo "========================================"
echo
echo "请选择适合你的启动方式："
echo "  1) 我熟悉开发环境（推荐使用 mise 管理 Node.js）"
echo "  2) 我不熟悉开发环境（使用全局安装的 Node.js）"
echo
read "mode?请输入 1 或 2 [默认 2]: "
mode="${mode:-2}"

case "$mode" in
  1)
    echo
    echo "[1/4] 已选择 mise 项目环境。"

    if ! command -v mise >/dev/null 2>&1; then
      echo "当前没有安装 mise。"
      if command -v brew >/dev/null 2>&1; then
        read "install_mise?是否现在通过 Homebrew 安装 mise？[Y/n]: "
        install_mise="${install_mise:-Y}"
        if [[ "$install_mise" =~ ^[Yy]$ ]]; then
          brew install mise || {
            echo "mise 安装失败。你也可以访问 https://mise.jdx.dev/installing-mise.html 手动安装。"
            pause_and_exit 1
          }
        else
          echo "已取消安装。请安装 mise 后重新运行本脚本。"
          open "https://mise.jdx.dev/installing-mise.html" >/dev/null 2>&1 || true
          pause_and_exit 0
        fi
      else
        echo "未检测到 Homebrew。即将打开 mise 官方安装说明。"
        echo "安装完成后，请重新双击本脚本。"
        open "https://mise.jdx.dev/installing-mise.html" >/dev/null 2>&1 || true
        pause_and_exit 0
      fi
    fi

    echo
    echo "[2/4] 正在准备项目指定的 Node.js 24 与 Rust 环境..."
    mise trust >/dev/null 2>&1 || true
    mise install || {
      echo "Node.js 环境安装失败，请检查网络连接和 mise 配置。"
      pause_and_exit 1
    }

    install_dependencies_if_needed mise exec --
    ensure_rust_toolchain mise exec -- || pause_and_exit 0

    echo
    echo "[4/4] 启动墨笺桌面应用..."
    echo "停止开发服务时，请回到此窗口按 Control + C。"
    echo
    mise exec -- npm run desktop:dev
    ;;

  2)
    echo
    echo "[1/4] 已选择全局 Node.js 环境。"
    echo "[2/4] 正在检查 Node.js..."

    if ! check_global_node; then
      echo
      echo "没有找到兼容的 Node.js。"
      echo "请安装 Node.js 24 LTS，然后重新双击本脚本。"
      echo "即将打开 Node.js 官方下载页面..."
      open "https://nodejs.org/en/download" >/dev/null 2>&1 || true
      pause_and_exit 0
    fi

    echo "检测通过：Node.js $(node --version)，npm $(npm --version)"
    install_dependencies_if_needed
    ensure_rust_toolchain || pause_and_exit 0

    echo
    echo "[4/4] 启动墨笺桌面应用..."
    echo "停止开发服务时，请回到此窗口按 Control + C。"
    echo
    npm run desktop:dev
    ;;

  *)
    echo "输入无效，请重新运行并选择 1 或 2。"
    pause_and_exit 1
    ;;
esac

exit_code=$?
if [[ $exit_code -ne 0 ]]; then
  echo
  echo "启动失败，错误码：$exit_code"
  pause_and_exit "$exit_code"
fi
