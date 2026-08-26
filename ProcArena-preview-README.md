# ProcArena 成果网站 

1. **Leaderboard**：各模型总 EX（方言×场景×单多轮全聚合），由低到高；
2. **Single-turn / Multi-turn EX**：论文 Table 4/5 的镜像。行=模型，列=11 个子场景，
   PostgreSQL/Oracle 用按钮切换，行尾 All 列是该方言合计；
3. **Interaction ability**：论文 Figure 2。纵轴 retention（多轮 EX ÷ 单轮 EX），
   横轴平均步数，点大小=单轮 EX，虚线为中位数；
4. **Action distribution**：论文 Figure 3。各模型动作占比热力图 + 右侧多轮 EX 同轴对照；
5. **Failure attribution**：论文 Figure 5 的占位版。目前按规格错误/实现错误二分
   （已从 recovery×EX 落盘），五分类跑出来后原位替换。
6. **B2 性能表、硬化消融表**（full vs no-contradiction：18/25 → 20/25）、
   附录（未进主表的 @B/submit-only/变体 run）、BibTeX。

完整网站上Table 4/5 的每个格子可以点，直达该格一道代表样题的完整轨迹页；
题面 → 逐步工具调用 / 提问 / 模拟用户回复 → 提交 → EX 判定与失败归因，右侧还有
elicitation ledger 的逐条回收情况。单文件塞不下 214 局轨迹数据，所以这里格子点不动。
完整版计划部署到 GitHub Pages 公开访问。
