# 骨牌造境

## 本地启动

```sh
npm ci
npm run dev
```

在浏览器打开 Vite 输出的本地地址。

## Docker 启动

```sh
docker compose up --build
```

打开 <http://localhost:8032>。端口可通过 `DOMINO_LAB_PORT` 修改。

## 碰撞取证与回放兼容

每次骨牌倒下时，传播器会把同一轮接触判定写成不可变的 `ContactReport` 快照，
挂在对应 `fall` / `interrupted` 事件以及 `SimulationRun.contactReports` 上：

- `candidates[]`：它尝试触碰的每一枚邻牌，含**实际间距** `distance`、触及半径
  `reach`、**朝向夹角** `alignment` / 阈值 `angleLimit`、逐项条件与结论原因；
- `winnerId`：同刻胜出的接触；
- `eligibleLoserIds` / `otherContactIds`：条件合格但距离排序未胜出、以及侧向擦过的接触；
- `grazedIds`：距离进入触及半径、却偏出前倒接触锥的“擦过侧边”邻牌；
- `blockerIds`：所有未通过条件的邻牌，每枚带独立原因——中断说明遍历该列表，
  **不会只把最近对象标成失败原因**（最近对象可能只是 90° 正侧邻牌）。

回放面板中点击任意事件行（或中断事件的“取证”按钮）即可展开证据；画布会同步
绘制触及半径、到各邻牌的连线与“间距 · 夹角”标签。

### 旧回放不被新属性覆盖

`event.detail` 与 `run.interruptionReason` 始终是运行时生成的权威说明。
新增字段全部是附加快照：`normalizeSimulationRun` 恢复旧 JSON 时只补结构默认值，
把 `evidenceVersion` 缺失的运行标记为 `legacy`，**不按当前构筑重算取证、不改写
任何历史文案**；旧事件展开时只显示原文与“历史回放无取证”提示。

### 从旧运行回到当前构筑

查看旧版本布局的回放时，点击回放面板右上角“返回当前构筑”（或按 `Esc`）即可
停止播放、摘除旧回放画布覆盖与定位焦点，回到实时构筑继续摆放 / 微调；旧运行与
取证仍保留在面板和本机存储中。点击任意事件或“在画布对照”会重新挂回该回放。

## 验证

无测试框架依赖的行为校验（含“正面倒向接收牌 + 另一枚同时擦过侧边 + 同刻落选”
布局、中断多原因归因、局部修正后的快照隔离、旧运行文案不可覆盖、与原
`nextContact` 的 400 组一致性、返回构筑状态流）：

```sh
npx -y tsx scripts/verify-contact-evidence.ts
```

组件渲染测试（可选，需要 vitest）：

```sh
npx -y vitest run
```
