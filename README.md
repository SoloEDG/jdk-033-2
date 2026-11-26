# 漂球测流图 · Drift Buoy Current Chart

通过不同位置投放的漂球和非均匀实际观测时刻，重建针岬湾的潮流候选场；对每条轨迹做小步长整段积分、误差与穿岸校核，并保留都能解释采样、但会把新漂球送向不同水路的 A/B 两种可能及分歧水域。

## 运行

```sh
npm ci
npm run dev
```

生产构建与类型检查：

```sh
npm run build
npm run typecheck
```

Docker：

```sh
docker compose up --build
```

默认地址为 http://127.0.0.1:8033。

## 已内置的演示数据

- `D01 北回水球`：从湾口北侧进入北回水涡。
- `D02 南槽球`：从湾口南侧进入南槽顺流带。
- `D03 西湾球`：补充西湾水道的流向证据。
- `D04 封存检验球`：角色为 `holdout`，重建过程不读取；可用它独立检验 A/B。

各球的观测时刻均为非均匀间隔。初始重建中，候选 A（北部分水）和候选 B（南槽顺流）都满足整段误差容差且无穿岸；D04 会支持候选 B。

## 主要领域模块

- `src/features/current/model/bay.ts`：湾岸多边形、水域判定、岸线相交和沿岸滑动碰撞。
- `src/features/current/model/field.ts`：共享流场、A/B 局部分歧流场、证据段和轨迹积分。
- `src/features/current/model/reconstruct.ts`：整段校核、支持水域汇总、候选评分和封存球检验。
- `src/features/current/model/trial.ts`：候选场中的试航船、流压、侧漂分量和航迹积分。
- `src/features/current/ui/CurrentMap.vue`：海图、岸线、流箭头、分歧区、漂球、候选预测、侧漂矢量和航迹。
- `src/app/useCurrentSurvey.ts`：观测录入、重建、检验和试航动画状态。

试航时，海图流箭头、船的流速/侧漂分解以及白色航迹都来自当前选中的同一个候选流场；切换候选会清空旧航迹，避免混用两份流场。
