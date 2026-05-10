# TuneNote 项目进度

## 当前状态

已完成 Android App 打包配置，可用 Android Studio 编译 APK。

```text
/workspace/tunenote/
  doc/
    requirements.md
    design.md
    progress.md
  app/
    backend/                    # Python FastAPI（当前仅返回 mock 数据）
    frontend/
      package.json
      index.html
      tsconfig.json
      vite.config.ts
      capacitor.config.ts       # 新增：Capacitor 配置
      src/
        main.tsx
        App.tsx
        api.ts
        audio.ts
        styles.css
        types.ts
        components/
          Recorder.tsx
          ScorePreview.tsx
          JianpuPreview.tsx
          StaffPreview.tsx
      dist/                     # Web 构建产物（已生成）
      android/                  # 新增：Android 原生项目
        app/
          src/main/
            AndroidManifest.xml  # 已添加 RECORD_AUDIO 权限
```

## 已完成

1. 项目初始文档（requirements, design, progress）
2. FastAPI 后端原型（`GET /api/health`, `POST /api/transcribe`）
3. React + Vite 前端原型（上传、录音、五线谱、简谱、回放）
4. Web 构建产物生成（`dist/`）
5. Capacitor 配置（Android 平台添加）
6. Android 权限配置（`RECORD_AUDIO` 已声明）

## 当前 MVP 功能状态

| 功能 | 状态 | 说明 |
|------|------|------|
| 音频上传 | ✅ 可用 | 不依赖服务器 |
| 浏览器录音 | ✅ 可用 | Android 上有权限 |
| 识别五线谱/简谱 | ✅ 可用 | 当前为 mock 数据 |
| 生成旋律回放 | ✅ 可用 | Web Audio API |
| 真实旋律提取 | ⚠️ 待实现 | 需要接入 Basic Pitch WASM |
| 导出 MIDI/MusicXML | ❌ 未实现 | 后端功能，前端暂无 |

## Android APK 编译方式

### 方式一：Android Studio（推荐首次）

```bash
cd /workspace/tunenote/app/frontend

# 打开 Android 项目（自动启动 Android Studio）
npx cap open android
```

在 Android Studio 中：
1. 等待 Gradle 同步完成（首次较慢）
2. 点击 **Build → Build Bundle(s) / APK(s) → Build APK(s)**
3. APK 生成在 `android/app/build/outputs/apk/debug/app-debug.apk`

### 方式二：命令行

```bash
# 进入 Android 项目目录
cd android

# 编译 Debug APK
./gradlew assembleDebug

# APK 位置
# android/app/build/outputs/apk/debug/app-debug.apk
```

### 安装到手机

1. 把 `app-debug.apk` 传到手机
2. 手机设置 → 安全 → 允许"安装未知来源应用"
3. 打开 APK 安装

### 后续更新 APK

修改前端代码后：
```bash
cd /workspace/tunenote/app/frontend
npm run build           # 构建新版本
npx cap sync android    # 同步到 Android 项目
```

然后重新编译 APK。

## 运行方式（Web 开发模式）

### 前端（当前模式）

```bash
cd /workspace/tunenote/app/frontend
npm run dev
```

### 后端（可选，用于真实验证识别接口）

```bash
cd /workspace/tunenote/app/backend
python -m venv .venv
. .venv/bin/activate
pip install -e .
uvicorn tunenote_api.main:app --reload --host 0.0.0.0 --port 8000
```

Android App 当前默认连接 `localhost:8000`，如需连接真实后端需修改 `capacitor.config.ts` 中的 `server.url`。

## 下一步建议

### 立即可做

验证 Android App 安装后，"上传音频 → 查看五线谱 → 回放旋律"流程是否正常。

### Phase 2：真实旋律识别

接入 Basic Pitch WebAssembly 版本，移除后端依赖：

```bash
npm install @basic-pitch/web
```

实现真正的"录音 → 提取主旋律 → 显示五线谱"全链路。

### Phase 3：增强功能

- MIDI / MusicXML 导出
- 音符编辑（手动修正低置信度音符）
- 调号 / 拍号 / 速度修改
- 改善五线谱渲染（接入 VexFlow）

## 后续 Agent 快速上手

请先阅读：
1. `doc/requirements.md` — 产品目标
2. `doc/design.md` — 架构和数据模型
3. `doc/progress.md` — 当前状态（本文档）

前端代码在 `app/frontend/src/`，核心文件：
- `App.tsx` — 主页面逻辑
- `api.ts` — 调用后端接口
- `audio.ts` — Web Audio API 回放
- `components/` — 五线谱、简谱、录音组件

Android 项目在 `app/frontend/android/`，可用 `npx cap open android` 打开。

## 注意事项

- 当前识别返回固定 mock 旋律，**不是真实音频分析**
- Android App 依赖前端 mock 数据，不连接后端也能运行
- 如需真实识别，需接入 `@basic-pitch/web`（WASM 版）
- `ScoreDraft` 数据结构是前后端共用契约，修改时需同步