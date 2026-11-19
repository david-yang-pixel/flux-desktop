# Flux Desktop

把 [Flux by Dify](https://mail.langgenius.ai/) 网页版封装成 macOS 桌面应用（Electron）。

- 打开 `https://mail.langgenius.ai/`，Cloudflare Access + 公司 Google 账号登录在应用窗口内完成，登录状态持久保存
- 使用标准 Chrome User-Agent，避免 Google 拦截内嵌浏览器登录
- 外部链接用系统默认浏览器打开
- 常用快捷键：复制粘贴、`⌘[` / `⌘]` 前进后退、`⌘⇧H` 回到首页、缩放、全屏；点关闭按钮只隐藏窗口，`⌘Q` 退出
- 新邮件通知：可选择接收哪些分组的通知（见下文）
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

## 新邮件通知

- 菜单栏「通知」里勾选要接收通知的分组（待处理、分配给我的、已共享的 Support 等），也可以「全部选择 / 全部取消」，
  或用「启用通知」总开关整体关闭；
- 默认开启：待处理、分配给我的、提及我的、已订阅；其他分组默认关闭；
- 原理：读取左侧栏每个分组的数字角标，数字变大且 Flux 不在前台时弹出 macOS 通知；点通知会打开 Flux 并跳到该分组；
- 关闭窗口（红色按钮）后仍会通知，`⌘Q` 退出后不会；左侧栏收起或分组折叠在「更多」里时读不到该分组；
- 第一次通知时 macOS 会询问是否允许，也可以在「系统设置 › 通知 › Flux」里调整；菜单「通知 › 发送测试通知」可以测试。

## 应用内更新

- 菜单 Flux › 检查更新…；默认启动 10 秒后检查一次、之后每天自动检查一次（菜单 Flux › 自动检查更新 可关闭）；
- 发现新版本后点「立即更新」：从 GitHub Releases 下载对应芯片的 DMG，校验 Bundle ID、版本号和签名完整性，
  替换「应用程序」中的 Flux 并重新打开；也可以选「稍后」或「跳过此版本」；
- 校验不通过时会提示前往下载页面手动安装；
- 需要从「应用程序」文件夹运行（直接在 DMG 里打开不能自动更新）。

> 不使用签名证书：每次构建都是临时签名（ad-hoc）。为避免每次更新后 macOS 弹窗要求输入密码访问钥匙串，
> Flux 不把登录 Cookie 的加密密钥存进钥匙串（Chromium 的 `use-mock-keychain`）。

## 从源码构建

需要 Node.js 22+。

```bash
npm install
npm start          # 本地运行
npm test           # 单元测试
npm run icon       # 由 build/icon.svg 生成 build/icon.png（npm run dist 会自动执行）
npm run dist       # 在 Mac 上构建 DMG，产物在 dist/
```

构建时默认使用临时签名（ad-hoc）；如需用证书签名，设置 `SIGN_IDENTITY`（证书名称或 SHA-1）。

### 在 Linux 上构建 DMG

electron-builder 在 Linux 上只能生成 `.app`，DMG 可以用 `scripts/mkdmg.py` 打成 macOS 可挂载的镜像（未签名）：

```bash
npm install
npm run icon
npx electron-builder --mac dir --arm64 --x64
python3 -m venv .venv && .venv/bin/pip install pycdlib
.venv/bin/python scripts/mkdmg.py dist/mac-arm64/Flux.app dist/Flux-1.0.0-arm64.dmg Flux
.venv/bin/python scripts/mkdmg.py dist/mac/Flux.app dist/Flux-1.0.0-x64.dmg Flux
```

## 项目结构

```
main.js                  主进程：窗口、登录域名白名单、菜单
preload.js               页面内脚本：读取左侧栏分组及未读数，点击通知时跳到对应分组
notifier.js              新邮件通知：「通知」菜单、分组设置、弹出系统通知
notify-utils.js          通知相关的纯函数（分组整理、默认设置、新邮件判断）
updater.js               应用内更新：检查 → 下载 DMG → 校验 → 替换并重启
update-utils.js          更新相关的纯函数（版本比较、选择安装包、签名要求解析）
test/                    单元测试
scripts/sign.js          electron-builder afterPack 钩子：给 .app 做临时签名（ad-hoc）
scripts/render-icon.js   用 resvg 把 build/icon.svg 渲染成 build/icon.png（构建时自动生成，不入库）
scripts/mkdmg.py         在 Linux 上把 .app 打成 DMG
build/icon.svg           应用图标源文件
.github/workflows/release.yml  自动构建与发布
```

修改默认打开的页面：编辑 `main.js` 里的 `HOME_URL`。
