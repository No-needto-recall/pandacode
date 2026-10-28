# 简体中文本地化验证记录

日期：2026-10-29。分支：`feat/zh-cn-localization`。

## 交付范围

Windows 桌面客户端与 iOS / Android 手机客户端的本地化源码。默认简体中文，可切换 English；包含共享词典、语言偏好、桌面辅助窗口与原生菜单、Windows 安装器语言配置、手机原生导航和实时活动的应用自有文案。

保持原有任务、权限与协议值不变；用户和模型内容、代码、路径、品牌、第三方原始输出不强制翻译。详细边界见 [本地化说明](localization.md)。

## 本地化实现阶段通过的检查

| 检查 | 结果 |
| --- | --- |
| 桌面 `npm run build` | 通过，包含字典同步检查、TypeScript 检查和 Vite 生产构建 |
| 桌面 Node 单元测试 | 190 / 190 通过 |
| 发布脚本与安装器配置测试 | 57 / 57 通过 |
| Windows Chrome 相关界面回归 | 152 / 152 通过，2 个 worker，约 3.4 分钟 |
| 手机 TypeScript 检查 | 通过 |
| 手机 Node 单元测试 | 161 / 161 通过 |
| 手机 Expo lint | 通过，无错误或警告 |
| Windows Rust `cargo check --lib` | 通过；保留原有 `cloud/ssh.rs` 的 `unused_mut` 警告 |
| `git diff --check` | 通过 |

152 项浏览器用例来自 `i18n`、`settings`、`provider-settings`、`worktrees`、`skills-library`、`model-tiers`、`turn-changes`、`agent-input`、`tray-popover`、`bots-thread`、`jj`、`streaming` 这 12 个 spec 文件。测试使用独立预览端口，既有英文用例显式选择英文，中文用例覆盖：

- 默认中文、英文持久化、非法语言偏好回退。
- 实际设置控件切换，以及已打开的服务提供方页面刷新。
- 普通输入草稿、光标选区、机器人表单及未保存的环境变量值保留。
- 独立窗口同步与本地存储不可用时的内存切换。
- 窄窗、大字号下的语言控件可用性。
- 原始用户文本和 HTML 特殊字符不被翻译或执行。

单元测试还检查词典与生成物一致、双语插值参数一致、源码调用参数完整、时间与数字格式化、未知状态的原型键边界，以及各运行器在两种语言下的权限模式 ID、图标和禁用状态一致。

## 回归期间修复的兼容问题

- 工作树清理、技能安全确认、工具活动和文件变更摘要的动态文案遗漏。
- 安装说明中的 CLI 命令恢复独立等宽元素，不改变命令内容。
- 机器人会话保留可见标题栏，避免首条消息的展开控件被标题栏遮挡。
- 节省策略按钮在窄窗下保持单行。
- 浏览器测试不再以 macOS 的 `⌘ N` 文案定位通用新建任务按钮；部分夹具等待初始工作区就绪，并分别配置当前运行器与新任务默认运行器。
- 分级说明的测试按仓库现有的 70% / 30% 规则验证，而不是已过时的强制先后顺序。
- 手机 Node 测试改用显式文件枚举，避免 Windows 下带引号的 glob 导致实际运行零项测试。
- Windows NSIS 使用实际语言标识 `SimpChinese` 和 `English`；版本、签名和更新地址未改变。

## GitHub Actions 预览构建

2026-10-29，[运行 40751339166](https://github.com/No-needto-recall/pandacode/actions/runs/40751339166) 的两个任务均成功，构建源码为 `e21b57a6ffa2c0fd9911c30452cd6df4311a2375`：

- Windows：完成 Rust 发行版链接、NSIS 打包，并在一次性 runner 安装后通过 30 秒进程存活检查。
- Android：完成 Expo prebuild、ARM64 release APK 构建、签名验证、16 KB ZIP 对齐、包名与非 debuggable 状态检查；确认内嵌 JavaScript，且 30 个原生库均为 ARM64。
- 下载后的 Windows 安装包与 Android APK 均复核了 SHA-256 和来源提交。
- 新增构建配置检查后，本地发布脚本测试为 61 项、手机测试为 163 项，均通过；CI 也通过了对应类型检查、测试与 lint 步骤。
- 没有使用上游 Expo 账号或项目，没有发布正式标签、应用商店或 npm 包。

下载入口及签名限制见 [中文预览包说明](localization-downloads.md)。这仍不是手机实机或全功能原生验收；两个包均未配置 Connect。

## 仍未完成的验收与历史限制

- **本地 Rust 测试二进制曾链接失败**：实际尝试 `cargo test --lib locale::tests` 时，ONNX `ort_sys` 库缺少 MSVC 符号 `__std_find_first_of_trivial_pos_1` / `_2`，报 `LNK1120`。后续 CI 的 Windows 发行版已成功链接，但没有单独重跑这组 Rust 单元测试。
- **Windows 安装包已在 CI 生成并安装检查**，但进程存活与浏览器 mock 验证不等于完整 WebView2、托盘或原生界面验收。
- **Android 已原生构建，但没有手机真机或模拟器启动验收；iOS 未构建**。VoiceOver / TalkBack、系统权限界面、锁屏与 Dynamic Island 仍需对应原生环境验证。此前 Expo web 预览被平台配置拒绝；未为测试扩展 Web 支持。
- 全量 1,067 项浏览器套件曾尝试运行，该轮日志记录 918 项通过、149 项失败，涉及平台假设、旧测试夹具/断言以及修复前的文案与布局问题。该轮不能作为最终版本的通过证明；完成修复后，最终稳定通过的是上述 **152 项相关回归**，其余用例未完成最终重新验收。
- 没有运行 macOS / Linux 的原生交叉构建。

本记录区分本地化实现阶段的检查与后续 GitHub Actions 预览构建。下载方式和构建边界见 [中文预览包说明](localization-downloads.md)，以对应源码提交的实际结果为准。
