# 中文预览包：Windows 与 Android

这是 PandaCode 的中文本地化分支，不是上游官方发布版。

**This is a fork of PandaCode** — [上游项目](https://github.com/aicodeking/pandacode)。

## 下载位置

[Chinese preview builds](https://github.com/No-needto-recall/pandacode/actions/workflows/zh-preview.yml) 在 `feat/zh-cn-localization` 分支推送后构建，也提供手动触发入口。打开对应提交的成功运行，在 Artifacts 中下载：

- `PandaCode-zh-CN-Windows-x64`：解压后运行 `PandaCode-zh-CN-Windows-x64-setup.exe`。
- `PandaCode-zh-CN-Android-arm64`：解压后在手机上安装 `PandaCode-zh-CN-Android-arm64-preview.apk`。

GitHub Actions 下载通常需要登录 GitHub。产物保留 30 天；每个包附带 SHA-256 校验值、构建来源信息和本说明。不创建正式发布标签，不发布到 npm 或应用商店。

## Windows

- 面向 Windows x64，NSIS 安装界面提供简体中文与英文。
- 安装名称为 `PandaCode Zh Preview`，应用标识为 `io.github.norecall.pandacode.zhpreview`，使用独立任务数据目录，不自动迁移原版任务；操作系统凭据存储的原有行为不变。
- 此预览未做 Authenticode 签名，Windows 可能提示未知发布者。只使用本仓库的构建产物，并核对随包 SHA-256。
- 预览包关闭上游自动更新，避免被官方英文版本覆盖。正常构建的默认更新策略不变。
- CI 安装到一次性 GitHub runner 的临时目录并检查进程能持续运行；这不等于完整原生界面验收。

## 小米 17 / Android ARM64

- 构建目标为 `arm64-v8a`，适用于小米 17 这类 ARM64 安卓手机。输出是 APK，不是无法直接安装的 AAB。
- 使用 release 构建变体，内嵌 JavaScript 和资源，**不需要 Expo Go 或电脑上的 Metro 开发服务器**。
- App 名称为“PandaCode 中文预览”，独立包名 `io.github.norecall.pandacode.zhpreview`，不会覆盖同包名为 `com.aicodeking.pandacode` 的原版。
- **仅供个人预览测试**：当前采用 Expo 模板的调试签名证书，不是用于可信生产发行的私有签名。不要将其当作正式商店发行版；正式分发前应配置长期私有签名。改变签名后无法直接覆盖安装旧包，卸载会丢失该应用的本地数据。
- CI 验证 APK 签名、16 KB ZIP 对齐、包名、非 debuggable 状态、ARM64 原生库以及内嵌 JavaScript；不宣称已经在用户的小米手机上实际启动验证。
- 安装时可按系统提示，仅为你用于打开 APK 的文件管理器或浏览器授予安装来源权限，不需要关闭系统整体安全保护。
- 国行小米环境不一定有 Google Play 服务；即使前台连接可用，也不能保证 FCM 后台推送可用。

## 手机连接电脑所需配置

手机端是 PandaCode Connect 的查看与控制客户端，**不会在手机本地运行编程智能体**。

Windows 与 Android 必须编入匹配的公开配置：

| 仓库变量 | 含义 |
| --- | --- |
| `PANDACODE_RELAY_URL` | 你使用的 Connect HTTPS 中继 origin，不含路径或查询参数 |
| `PANDACODE_GITHUB_CLIENT_ID` | 与该中继配套的 GitHub OAuth App Client ID，需启用 Device Flow |

工作流将它们同时传给桌面编译和 Android 的 Expo prebuild / Metro 打包阶段。可以在手动触发时提供同名含义的输入。**Client ID 不是 Client Secret，不要把密钥放入任何 `EXPO_PUBLIC_*` 变量。**

两项都未设置时，构建会明确警告并生成 Connect 未配置的预览包：Windows 可本地使用，手机可以查看手动进入的演示，但不能登录并控制电脑。只设置其中一项会拒绝构建，避免交付不一致的配置。配置完成后必须重新构建两个客户端；安装旧 APK 后再改仓库变量不会改变已经打包的程序。

中继部署与 GitHub 登录要求见 [远程访问文档](remote-access.md)。不能随意填写未知的 Client ID，也不能假定上游的中继与自己的 OAuth App 兼容。

## 构建方式与边界

- Windows 使用现有 Tauri/Rust 工程以及 `src-tauri/tauri.zh-preview.conf.json` 覆盖配置。
- Android 使用 Expo SDK 58、Node 22、JDK 17、Android SDK 37、NDK 27.1.12297006；只在 CI 中运行 Expo prebuild 生成原生目录，然后通过生成的 Gradle wrapper 构建 APK。
- 不提交生成的 `mobile/android` / `mobile/ios`，不运行 EAS 云构建，不使用仓库上游 Expo 账号或项目。Android 预览配置会去掉上游 owner / EAS project ID。
- `EXPO_PUBLIC_PANDACODE_DEMO` 固定关闭；不会把强制演示模式当作可连接的正式客户端。

本地化测试与尚未完成的原生验收见 [验证记录](localization-verification.md)。以 Actions 对应提交的实际运行结果为构建是否成功的依据。
