# LexiFlow 1.1.5

LexiFlow 是本地英语阅读工具。安装版可导入本机的 TXT、Markdown、EPUB、PDF 或 Word（.docx），点击单词查询 ECDICT，把释义和原文语境放进生词本，再按自己的节奏复习。安装包内含词典和界面资源，首次启动即可离线学习。

[下载安装包与离线词典](https://github.com/killsiwk1/LexiFlow-Reader/releases/tag/v1.1.5) · [查看测试报告](docs/测试报告.md)

在「设置 → 外观与阅读」或书中的「阅读排版」切换全局主题。TXT 沿用第一版的单栏文章和底部翻页，PDF 在独立文档视图顶部提供翻页、目录、缩放和搜索。「适合整页」可以一次查看完整的原页。

在首页或书架点「导入文章」，按钮旁列有支持的格式。DOCX 使用独立的 Word 文档视图，保留常见文字样式、段落、列表、表格、内嵌图片和显式分页。含 DOCX 的 JSON 备份请使用 1.1.2 或更新的兼容安装版恢复。

Windows x64 安装向导在欢迎页之后提供目标文件夹选择。点击「浏览」选择当前账户可写的专用文件夹（例如 `D:\Applications\LexiFlow`）。默认创建桌面快捷方式。安装后从桌面或开始菜单打开，后续安装默认使用本次记录的位置。书架与学习记录存储在当前用户的应用数据中。

升级时使用相同操作系统用户和应用标识。移动端直接覆盖安装，保留手机原有应用数据。新版本可恢复旧版 JSON；1.1 的备份含 PDF、插图和句子，应使用 1.1 或更高兼容版本恢复。

- [使用说明](docs/使用说明.md)
- [技术架构和目录](docs/技术架构.md)
- [测试报告与已知问题](docs/测试报告.md)
- [词典来源和许可](docs/词典说明.md)

## 从源码运行

需要 Node.js 22 或更高、pnpm 11，以及对应平台的 Tauri 2 编译环境。首次安装开发依赖需要网络。开发前从本仓库 v1.1.5 Release 下载 ECDICT.lexdict，在项目根目录运行 `python3 scripts/unpack_dictionary.py /path/to/ECDICT.lexdict`。脚本校验全部 128 个分片。

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm dev
```

本机开发入口为 `http://127.0.0.1:1420`。浏览器和原生应用各有自己的本地数据库，迁移学习记录请使用 JSON。

```sh
pnpm build
pnpm tauri dev
pnpm tauri build
```

在 Windows 安装 MSVC、Windows SDK、Rust 和 WebView2，在 macOS 安装 Xcode Command Line Tools 和 Rust。跨平台构建和签名情况以测试报告为准。

Android 工程位于 `src-tauri/gen/android`。配置 JDK、Android SDK、NDK、Rust Android 目标及 `ANDROID_HOME`、`NDK_HOME`、`JAVA_HOME` 后执行：

```sh
pnpm tauri android build --apk --split-per-abi --target aarch64 x86_64
```

正式发布 Android 更新需要保留同一签名密钥。项目没有嵌入发布私钥。安装包见 GitHub Releases，验收范围见 docs/测试报告.md。

## 复跑交互验收

先执行 `pnpm build`，在另一个终端以 `python3 -m http.server 1421 --bind 127.0.0.1 --directory dist` 启动本地生产资源服务。将环境变量 `LEXIFLOW_BROWSER` 设为本机 Chromium 浏览器可执行文件路径，然后在项目目录运行以下命令。

```sh
node tests/browser-smoke.cjs
node tests/dictionary-restart.cjs
node tests/publications.cjs
```

第二项需要将 `LEXIFLOW_PACK` 设为完整 .lexdict 文件路径，默认查找项目上一级的 ECDICT.lexdict。要复测 DOCX 导入、表格、图片、查词、重开与备份恢复，将环境变量 `LEXIFLOW_URL` 设为 `http://127.0.0.1:1421`，然后运行 `node tests/docx.cjs`。测试创建独立的临时浏览器资料。原生应用离线使用时无需服务或开发工具。


## 许可

软件使用 GPL-3.0-only。第三方组件和词典沿用各自的许可。

## 重建带目录选择页的 Windows 安装包

发行版使用 `packaging/windows.nsi`。准备 64 位 LexiFlow.exe、配套的 WebView2Loader.dll 和构建产物依赖的运行库，放在同一目录；另备微软 x64 Evergreen 离线安装程序。在已安装 NSIS 3 的 Windows 中运行：

```powershell
./packaging/build-installer.ps1 -AppDir .\payload -WebView2OfflineInstaller .\MicrosoftEdgeWebView2RuntimeInstallerX64.exe -Output .\LexiFlow-Setup.exe
```
