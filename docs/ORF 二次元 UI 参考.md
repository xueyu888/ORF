# ORF 二次元 UI 参考

## 参考来源

- 原神官网首页：https://genshin.hoyoverse.com/en/home
- 原神官网新闻页：https://genshin.hoyoverse.com/en/news
- 原神官网角色页：https://genshin.hoyoverse.com/en/character/mondstadt?char=0
- HoYoWiki 原神首页：https://wiki.hoyolab.com/pc/genshin/home
- 原神国服官网首页：https://www.yuanshen.com/#/

## 本地素材库

- `src/assets/orf-icons/fantasy-ui-panel-frames.png`：面板边框、卡片框、弹窗、章节标题、分隔线、标签芯片、角花参考。
- `src/assets/orf-icons/fantasy-ui-controls.png`：按钮、标签页、开关、复选框、搜索框、下拉、分页、状态徽章参考。
- `src/assets/orf-icons/fantasy-ui-navigation.png`：侧边栏、顶栏、菜单状态、用户面板、筛选面板、折叠区块、列表行参考。
- `src/assets/orf-icons/fantasy-ui-task-widgets.png`：任务卡、看板列头、日期片、进度条、统计卡、时间线、通知、任务详情参考。

## 设计观察

- 角色和场景素材优先展示，信息层用半透明深色或暖白卡片压在背景上。
- 主色倾向深蓝灰、暖白、金色，青蓝高光用于 active / focus / 能量感。
- 导航高亮常用发光文字、金色或青蓝细线、菱形/徽记小装饰。
- 卡片圆角克制，阴影不厚重，靠透明度、描边和装饰线分层。
- 大标题和模块标题有幻想感，使用金色、衬线字重或更强的层次对比。
- 列表和网格保持清晰，不牺牲信息密度。
- 本地参考板更偏“蓝金描边 + 羊皮纸底 + 斜切按钮 + 徽记状态”的任务管理组件语言，适合 ORF 的密集业务界面。

## ORF 落地原则

- 不复制原神官方素材、图标和具体 UI 资源，只参考配色、层次、布局语言。
- 侧边栏人物图作为主视觉，不使用大面积遮罩，只给文字和按钮做小范围可读性处理。
- 任务页保留工具属性，使用暖白纸感面板、金色细线、青蓝状态高光和徽记式状态标签。
- 状态色要鲜明但不刺眼：进行中用水蓝，正常用青绿，风险/待验收用金色，危险用珊瑚红。
- 参考板作为素材库积累，不整张导入运行时页面；具体界面以 CSS 组件样式落地，避免把素材硬编码进业务组件。
