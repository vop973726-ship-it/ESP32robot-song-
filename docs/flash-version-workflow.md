# 烧录版本工作流

这个仓库的目标不是只保存“当前能烧进去的代码”，而是保存“每一次烧录对应的完整来源”。

## 基本原则

1. 所有会影响烧录结果的代码都放在同一个仓库里：
   - `firmware/esp32_robot_controller`
   - `firmware/esp32_cam_streamer`
   - `apps/server`
   - `apps/web`
2. 每次准备烧录前，先提交当前改动。
3. 每次确认机器人运行正常后，为该版本打一个可读标签。
4. 不直接在“上一次稳定版本”上覆盖实验功能，而是开分支开发。

## 推荐流程

### 1. 开始新功能

```bash
git checkout -b feat/<feature-name>
```

### 2. 开发并本地校验

```bash
npm run check
```

如果只改了某一个部分，也至少保证对应部分可构建或可编译。

### 3. 准备烧录前提交

```bash
git add .
git commit -m "feat: add <feature-name>"
```

这样本次烧录就对应到一个明确 commit，不会再出现“现在板子里的功能是哪一版代码”说不清的问题。

### 4. 烧录并实机验证

- 机器人主控固件：`firmware/esp32_robot_controller`
- 相机固件：`firmware/esp32_cam_streamer`
- Web / Server 改动如果参与 OTA、控制协议或动作脚本，也必须一起提交

### 5. 验证通过后打标签

```bash
git tag -a robot-v0.1.0 -m "Stable robot firmware + console release"
git push origin main --tags
```

标签建议和实际烧录版本对应，例如：

- `robot-v0.1.0`
- `robot-v0.1.1-gait`
- `robot-v0.2.0-camera-ota`

## 回滚方式

如果新版本烧录后出现回归：

```bash
git checkout <stable-tag-or-commit>
```

然后重新构建并烧录该版本，对应功能就能回到上一个稳定状态。

## 配置文件约定

- `firmware/**/include/secrets.h` 不进入 Git
- 示例配置保存在 `secrets.example.h`
- 本机服务配置使用 `.env`，也不进入 Git

这样可以保证：

- 仓库里永远保存完整代码结构
- 私密 Wi-Fi / 本机环境配置不会被误提交
- 新设备或新环境仍可通过 example 文件快速恢复
