# 双人默契大乱斗 · LINK / ARENA

一台电脑、两位玩家的本地同屏格斗游戏。包含擂台对决、双星共振合作战和巨兽警报三种模式，支持键盘与最多两只标准映射手柄。

## 开始游玩

无需安装依赖。最快的方式是在 Windows 上打开 [`outputs/双人默契大乱斗-双击即玩.html`](outputs/双人默契大乱斗-双击即玩.html)。

使用手柄时，建议运行本地网页服务：

1. 安装 Node.js。
2. 在 `outputs` 目录运行 `npm start`，或双击 `outputs/开始游戏.cmd`。
3. 在 Edge 或 Chrome 打开 `http://127.0.0.1:4178`。

## 默认操作

| 动作 | 玩家一（爸爸） | 玩家二（你） | Xbox / 标准手柄 |
| --- | --- | --- | --- |
| 移动 | W / A / D / Z | 方向键 | 左摇杆 / 方向键 |
| 攻击 | 1 | 7 | A |
| 冲刺 | 2 | 8 | B |
| 技能 | 3 | 9 | X |
| 格挡 / 合作动作 | 4 | 0 | Y |
| 暂停 | Esc | Esc | Start |

详细规则、连击、必杀技和每种模式的获胜条件见[游玩说明](outputs/游玩说明.md)。

## 开发与检查

运行 `node work/build.cjs` 可重建独立版 HTML。运行 `npm run check --prefix outputs` 可检查游戏脚本语法；`node work/test-battle.cjs` 和 `node work/test-coop-playthrough.cjs` 可运行战斗与合作流程模拟。

## 许可

本项目采用 [MIT License](LICENSE)。
