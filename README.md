## 虚拟宠物 Virtual Pet

一个基于 Vite + React + TypeScript + Tailwind 的手势互动小项目。通过 MediaPipe Hands 在浏览器内实时识别手势，与屏幕上的虚拟宠物进行互动。

### 功能特性
- **启动/停止相机**: 一键开启/关闭摄像头权限
- **捏合抓取**: 在宠物附近捏合即可抓起并拖动移动
- **捏合喂食**: 在碗附近捏合触发喂食效果
- **张开手抚摸**: 张开手靠近宠物触发抚摸反馈
- **高速击掌**: 张开手快速接近宠物触发 “High five!”
- **指向戳一下**: 食指指向靠近宠物触发 “Boop!”
- **上传图片**: 自定义宠物头像
- **调试面板**: 查看手部检测、手势状态、位置等调试信息

### 快速开始
```bash
# 安装依赖
npm install

# 本地开发（默认 http://localhost:5173）
npm run dev
```
### 使用说明
- 浏览器会请求摄像头权限，请允许
- 点击首页的 “Start Camera” 进入互动界面；可点击 “Stop Camera” 关闭
- 页面下方指引列出了所有可用手势
- 在互动界面右上角显示手部检测状态；左上角可打开 Debug 面板
- 支持在互动界面点击 “Change Pet Image” 或首页的 “Upload Pet Image” 上传自定义头像

### 主要技术
- Vite + React + TypeScript
- Tailwind CSS
- MediaPipe Hands（通过 CDN 加载 `@mediapipe/hands` 与 `@mediapipe/drawing_utils`）

### 目录结构
```
src/
  main.tsx        # 应用入口
  App.tsx         # 根组件
  components/
    VirtualPet.tsx  # 核心互动组件（手势识别与渲染逻辑）
```

### License
MIT
