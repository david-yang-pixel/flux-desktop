# Flux Desktop

把 [Flux by Dify](https://mail.langgenius.ai/) 网页版封装成 macOS 桌面应用（Electron）。

- 打开 `https://mail.langgenius.ai/`，Cloudflare Access + 公司 Google 账号登录在应用窗口内完成，登录状态持久保存
- 使用标准 Chrome User-Agent，避免 Google 拦截内嵌浏览器登录
- 外部链接用系统默认浏览器打开
- 常用快捷键：复制粘贴、`⌘[` / `⌘]` 前进后退、`⌘⇧H` 回到首页、缩放、全屏；点关闭按钮只隐藏窗口，`⌘Q` 退出
- 应用内更新（见下文）

## 下载安装

1. 到 [Releases 最新版本](https://github.com/david-yang-pixel/flux-desktop/releases/latest) 下载对应芯片的 DMG：
   M 系列芯片选 `Flux-<版本>-arm64.dmg`，Intel 芯片选 `Flux-<版本>-x64.dmg`；
2. 双击打开，把 Flux 拖到「应用程序」文件夹；
3. 首次打开：由于没有 Apple 开发者签名，系统会提示"无法验证开发者"。点「完成」，然后到
   **系统设置 › 隐私与安全性**，在页面下方点「仍要打开」。
   （或在终端执行 `xattr -dr com.apple.quarantine /Applications/Flux.app` 后再打开）

## 版本号

- 每次推送到 `main`，GitHub Actions 都会自动构建并发布一个新版本；
- 版本号 = `package.json` 中 `version` 的「主版本.次版本」+ 构建序号，例如 `1.0.7`；
- 想升主/次版本：把 `package.json` 的 `version` 改成如 `1.1.0`，之后的构建就是 `1.1.<序号>`；
- 菜单 Flux › About Flux 可以看到当前版本。

## 应用内更新

- 菜单 Flux › 检查更新…；默认启动 10 秒后检查一次、之后每天自动检查一次（菜单 Flux › 自动检查更新 可关闭）；
- 发现新版本后点「立即更新」：自动下载对应芯片的 DMG、校验签名、替换「应用程序」中的 Flux 并重新打开；
  也可以选「稍后」或「跳过此版本」；
- 安装包必须与当前版本由同一证书签名才会安装，防止被替换；校验不通过时会提示前往下载页面手动安装；
- 需要从「应用程序」文件夹运行（直接在 DMG 里打开不能自动更新）。

### 签名证书

CI 使用一个固定的自签名证书签名，存放在仓库的 Actions Secrets：

| Secret | 内容 |
| --- | --- |
| `MACOS_CERT_P12` | 证书（含私钥）导出的 `.p12` 文件，base64 编码 |
| `MACOS_CERT_PASSWORD` | 导出 `.p12` 时设置的密码 |

因此每次构建的签名都相同，应用内更新可以校验安装包。未配置这两个 Secret 时，CI 会使用临时签名（ad-hoc）照常发布，
但这样的版本无法在应用内自动更新（会提示手动下载）；配置好证书后手动安装一次新版本，以后即可在应用内直接更新。

创建证书：「钥匙串访问 › 证书助理 › 创建证书」，名称如 `Flux Signing`，身份类型「自签名根证书」，证书类型「代码签名」；
然后在钥匙串中右键该证书 › 导出为 `.p12`（设置密码），再执行：

```bash
base64 -i Flux-Signing.p12 | pbcopy
```

把剪贴板内容填到 `MACOS_CERT_P12`，密码填到 `MACOS_CERT_PASSWORD`（仓库 Settings › Secrets and variables › Actions）。
也可以直接复用其他项目（如 SimpleShot）的同一份 `.p12`。

## 从源码构建

需要 Node.js 22+。

```bash
npm install
npm start          # 本地运行
npm test           # 单元测试
npm run dist       # 在 Mac 上构建 DMG，产物在 dist/
```

在 Mac 上构建时，设置 `SIGN_IDENTITY`（证书名称或 SHA-1）即可用该证书签名，否则使用临时签名。

### 在 Linux 上构建 DMG

electron-builder 在 Linux 上只能生成 `.app`，DMG 可以用 `scripts/mkdmg.py` 打成 macOS 可挂载的镜像（未签名）：

```bash
npm install
npx electron-builder --mac dir --arm64 --x64
python3 -m venv .venv && .venv/bin/pip install pycdlib
.venv/bin/python scripts/mkdmg.py dist/mac-arm64/Flux.app dist/Flux-1.0.0-arm64.dmg Flux
.venv/bin/python scripts/mkdmg.py dist/mac/Flux.app dist/Flux-1.0.0-x64.dmg Flux
```

## 项目结构

```
main.js                  主进程：窗口、登录域名白名单、菜单
updater.js               应用内更新：检查 → 下载 DMG → 校验签名 → 替换并重启
update-utils.js          更新相关的纯函数（版本比较、选择安装包、签名要求解析）
test/                    单元测试
scripts/sign.js          electron-builder afterPack 钩子：用 SIGN_IDENTITY 或临时签名签 .app
scripts/make-icon.js     用 Playwright 渲染 build/icon.png
scripts/mkdmg.py         在 Linux 上把 .app 打成 DMG
build/icon.png           应用图标（1024×1024）
.github/workflows/release.yml  自动构建与发布
```

修改默认打开的页面：编辑 `main.js` 里的 `HOME_URL`。
