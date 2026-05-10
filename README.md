# TuneNote

听曲写谱 — 录制或上传一段旋律，实时提取主旋律，生成五线谱与简谱。

## 功能

- 录音 / 上传音频
- 实时音高检测（浏览器端，不依赖服务器）
- 五线谱 / 简谱展示
- 生成旋律回放

## 技术栈

- **前端**：React + Vite + TypeScript
- **音频识别**：pitchfinder（YIN / AMDF 算法）
- **打包**：Capacitor → Android APK

## 开发

```bash
# 安装依赖
cd app/frontend
npm install

# 本地开发
npm run dev

# 构建
npm run build

# 同步到 Android
npx cap sync android

# 用 Android Studio 打开
npx cap open android
```

## 编译 APK（本地）

```bash
cd app/frontend/android
./gradlew assembleDebug
```

APK 输出在：`app/frontend/android/app/build/outputs/apk/debug/app-debug.apk`

## GitHub Actions

推送到 main 分支会自动触发 CI 构建，生成 APK artifact。