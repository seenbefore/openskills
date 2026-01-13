# OpenSkills

[![npm version](https://img.shields.io/npm/v/openskills.svg)](https://www.npmjs.com/package/openskills)
[![npm downloads](https://img.shields.io/npm/dm/openskills.svg)](https://www.npmjs.com/package/openskills)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

**最接近 Claude Code 技能系统的实现** — 相同的提示格式、相同的市场、相同的文件夹，只是使用 CLI 而不是工具。

```bash
npm i -g openskills
openskills install anthropics/skills
openskills sync
```

> **觉得有用？** 关注 [@nummanali](https://x.com/nummanali) 获取更多 AI 工具！

---

## 这是什么？

OpenSkills 将 **Anthropic 的技能系统** 带到所有 AI 编程代理（Claude Code、Cursor、Windsurf、Aider）。

**对于 Claude Code 用户：**
- 从任何 GitHub 仓库安装技能，不仅仅是市场
- 从本地路径或私有 git 仓库安装
- 在多个代理之间共享技能
- 在仓库中版本控制你的技能
- 使用符号链接进行本地开发

**对于其他代理（Cursor、Windsurf、Aider）：**
- 通用地获得 Claude Code 的技能系统
- 通过 GitHub 访问 Anthropic 的市场技能
- 使用渐进式披露（按需加载技能）

---

## 如何完全匹配 Claude Code

OpenSkills 以 **100% 兼容性** 复制 Claude Code 的技能系统：

- ✅ **相同的提示格式** — 带有技能标签的 `<available_skills>` XML
- ✅ **相同的市场** — 从 [anthropics/skills](https://github.com/anthropics/skills) 安装
- ✅ **相同的文件夹** — 默认使用 `.claude/skills/`
- ✅ **相同的 SKILL.md 格式** — YAML 前置元数据 + markdown 指令
- ✅ **相同的渐进式披露** — 按需加载技能，而不是预先加载

**唯一区别：** Claude Code 使用 `Skill` 工具，OpenSkills 使用 `openskills read <name>` CLI 命令。

**高级：** 使用 `--universal` 标志安装到 `.agent/skills/`，用于 Claude Code + 共享一个 AGENTS.md 的其他代理。

---

## 快速开始

### 1. 安装

**方式一：从 npm 安装（推荐）**

```bash
npm i -g openskills
```

**方式二：从源码构建并本地安装**

```bash
# 克隆项目
git clone https://github.com/numman-ali/openskills.git
cd openskills

# 安装依赖
npm install

# 构建项目
npm run build

# 本地链接（创建全局符号链接）
npm link

# 验证安装
openskills --version
```

使用 `npm link` 后，`openskills` 命令将指向本地构建的版本。如需取消链接，运行 `npm unlink -g openskills`。

### 2. 安装技能

```bash
# 从 Anthropic 市场安装（交互式选择，默认：项目）
openskills install anthropics/skills

# 或从任何 GitHub 仓库安装
openskills install your-org/custom-skills
```

### 3. 同步到 AGENTS.md

_注意：你必须有一个预先存在的 AGENTS.md 文件才能进行同步更新。_

```bash
openskills sync
```

完成！你的代理现在拥有与 Claude Code 相同的 `<available_skills>` 格式的技能。

---

## 工作原理（技术深入）

### Claude Code 的技能系统

当你使用安装了技能的 Claude Code 时，Claude 的系统提示包括：

```xml
<skills_instructions>
When users ask you to perform tasks, check if any of the available skills below can help complete the task more effectively.

How to use skills:
- Invoke skills using this tool with the skill name only (no arguments)
- When you invoke a skill, you will see <command-message>The "{name}" skill is loading</command-message>
- The skill's prompt will expand and provide detailed instructions

Important:
- Only use skills listed in <available_skills> below
- Do not invoke a skill that is already running
</skills_instructions>

<available_skills>
<skill>
<name>pdf</name>
<description>Comprehensive PDF manipulation toolkit for extracting text and tables, creating new PDFs, merging/splitting documents, and handling forms...</description>
<location>plugin</location>
</skill>

<skill>
<name>xlsx</name>
<description>Comprehensive spreadsheet creation, editing, and analysis with support for formulas, formatting, data analysis...</description>
<location>plugin</location>
</skill>
</available_skills>
```

**Claude 如何使用它：**
1. 用户询问："从 PDF 中提取数据"
2. Claude 扫描 `<available_skills>` → 找到 "pdf" 技能
3. Claude 调用：`Skill("pdf")`
4. SKILL.md 内容加载详细指令
5. Claude 按照指令完成任务

### OpenSkills 的系统（相同格式）

OpenSkills 在你的 AGENTS.md 中生成 **完全相同的** `<available_skills>` XML：

```xml
<skills_system priority="1">

## Available Skills

<!-- SKILLS_TABLE_START -->
<usage>
When users ask you to perform tasks, check if any of the available skills below can help complete the task more effectively.

How to use skills:
- Invoke: Bash("openskills read <skill-name>")
- The skill content will load with detailed instructions
- Base directory provided in output for resolving bundled resources

Usage notes:
- Only use skills listed in <available_skills> below
- Do not invoke a skill that is already loaded in your context
</usage>

<available_skills>

<skill>
<name>pdf</name>
<description>Comprehensive PDF manipulation toolkit for extracting text and tables, creating new PDFs, merging/splitting documents, and handling forms...</description>
<location>project</location>
</skill>

<skill>
<name>xlsx</name>
<description>Comprehensive spreadsheet creation, editing, and analysis with support for formulas, formatting, data analysis...</description>
<location>project</location>
</skill>

</available_skills>
<!-- SKILLS_TABLE_END -->

</skills_system>
```

**代理如何使用它：**
1. 用户询问："从 PDF 中提取数据"
2. 代理扫描 `<available_skills>` → 找到 "pdf" 技能
3. 代理调用：`Bash("openskills read pdf")`
4. SKILL.md 内容输出到代理的上下文
5. 代理按照指令完成任务

### 并排比较

| 方面 | Claude Code | OpenSkills |
|------|-------------|------------|
| **系统提示** | 内置到 Claude Code | 在 AGENTS.md 中 |
| **调用** | `Skill("pdf")` 工具 | `openskills read pdf` CLI |
| **提示格式** | `<available_skills>` XML | `<available_skills>` XML（相同） |
| **文件夹结构** | `.claude/skills/` | `.claude/skills/`（相同） |
| **SKILL.md 格式** | YAML + markdown | YAML + markdown（相同） |
| **渐进式披露** | 是 | 是 |
| **捆绑资源** | `references/`、`scripts/`、`assets/` | `references/`、`scripts/`、`assets/`（相同） |
| **市场** | Anthropic 市场 | GitHub (anthropics/skills) |

**除了调用方法外，一切都相同。**

### SKILL.md 格式

两者使用完全相同的格式：

```markdown
---
name: pdf
description: Comprehensive PDF manipulation toolkit for extracting text and tables, creating new PDFs, merging/splitting documents, and handling forms.
---

# PDF Skill Instructions

When the user asks you to work with PDFs, follow these steps:

1. Install dependencies: `pip install pypdf2`
2. Extract text using the extract_text.py script in scripts/
3. For bundled resources, use the base directory provided in the skill output
4. ...

[Detailed instructions that Claude/agent follows]
```

**渐进式披露：** 完整指令仅在调用技能时加载，保持代理上下文清洁。

---

## 为什么使用 CLI 而不是 MCP？

**MCP（模型上下文协议）** 是 Anthropic 用于将 AI 连接到外部工具和数据源的协议。它适用于：
- 数据库连接
- API 集成
- 实时数据获取
- 外部服务集成

**技能（SKILL.md 格式）** 不同 — 它们用于：
- 专业工作流（PDF 操作、电子表格编辑）
- 捆绑资源（脚本、模板、参考资料）
- 渐进式披露（仅在需要时加载指令）
- 静态、可重用模式

**为什么不通过 MCP 实现技能？**

1. **技能是静态指令，不是动态工具**
   MCP 用于服务器-客户端连接。技能是带有指令的 markdown 文件。

2. **不需要服务器**
   技能只是文件。MCP 需要运行服务器。

3. **通用兼容性**
   CLI 适用于任何代理（Claude Code、Cursor、Windsurf、Aider）。MCP 需要 MCP 支持。

4. **遵循 Anthropic 的设计**
   Anthropic 将技能创建为 SKILL.md 文件，而不是 MCP 服务器。我们正在实现他们的规范。

5. **对用户更简单**
   `openskills install anthropics/skills` vs "配置 MCP 服务器、设置身份验证、管理服务器生命周期"

**MCP 和技能解决不同的问题。** OpenSkills 按照设计的方式实现 Anthropic 的技能规范（SKILL.md 格式）— 作为渐进式加载的 markdown 指令。

---

## Claude Code 兼容性

你可以**同时**使用 Claude Code 插件和 OpenSkills 项目技能：

**在你的 `<available_skills>` 列表中：**
```xml
<skill>
<name>pdf</name>
<description>...</description>
<location>plugin</location>  <!-- Claude Code 市场 -->
</skill>

<skill>
<name>custom-skill</name>
<description>...</description>
<location>project</location>  <!-- 来自 GitHub 的 OpenSkills -->
</skill>
```

它们完美共存。Claude 通过 `Skill` 工具调用市场插件，OpenSkills 技能通过 CLI。没有冲突。

### 高级：多代理设置的通用模式

**问题：** 如果你使用 Claude Code + 其他代理（Cursor、Windsurf、Aider）与一个 AGENTS.md，安装到 `.claude/skills/` 可能会与 Claude Code 的市场插件创建重复。

**解决方案：** 使用 `--universal` 安装到 `.agent/skills/`：

```bash
openskills install anthropics/skills --universal
```

这将技能安装到 `.agent/skills/`，它：
- ✅ 通过 AGENTS.md 适用于所有代理
- ✅ 不与 Claude Code 的原生市场插件冲突
- ✅ 将 Claude Code 的 `<available_skills>` 与 AGENTS.md 技能分开

**何时使用：**
- ✅ 你使用 Claude Code + Cursor/Windsurf/Aider 与一个 AGENTS.md
- ✅ 你想避免重复的技能定义
- ✅ 你更喜欢 `.agent/` 用于基础设施（保持 `.claude/` 仅用于 Claude Code）

**何时不使用：**
- ❌ 你只使用 Claude Code（默认 `.claude/skills/` 即可）
- ❌ 你只使用非 Claude 代理（默认 `.claude/skills/` 即可）

**优先级顺序：**
OpenSkills 按优先级顺序搜索 4 个位置：
1. `./.agent/skills/`（项目通用）
2. `~/.agent/skills/`（全局通用）
3. `./.claude/skills/`（项目）
4. `~/.claude/skills/`（全局）

同名技能只出现一次（最高优先级获胜）。

---

## 命令

```bash
openskills install <source> [options]  # 从 GitHub、本地路径或私有仓库安装
openskills sync [-y] [-o <path>]       # 更新 AGENTS.md（或自定义输出）
openskills list                        # 显示已安装的技能
openskills read <name>                 # 加载技能（供代理使用）
openskills manage                      # 删除技能（交互式）
openskills remove <name>               # 删除特定技能
openskills repo add <name> <url>       # 添加上传技能的仓库
openskills repo remove <name>          # 删除仓库
openskills repo list                   # 列出配置的仓库
openskills upload [skill-name] [options] # 上传技能到仓库
```

### 标志

- `--global` — 全局安装到 `~/.claude/skills`（默认：项目安装）
- `--universal` — 安装到 `.agent/skills/` 而不是 `.claude/skills/`（高级）
- `-y, --yes` — 跳过所有提示，包括覆盖（用于脚本/CI）
- `-o, --output <path>` — 同步的自定义输出文件（默认：`AGENTS.md`）

### 安装模式

**默认（推荐）：**
```bash
openskills install anthropics/skills
# → 安装到 ./.claude/skills（项目，gitignored）
```

**全局安装：**
```bash
openskills install anthropics/skills --global
# → 安装到 ~/.claude/skills（跨项目共享）
```

**通用模式（高级）：**
```bash
openskills install anthropics/skills --universal
# → 安装到 ./.agent/skills（用于 Claude Code + 其他代理）
```

### 从本地路径安装

```bash
# 绝对路径
openskills install /path/to/my-skill

# 相对路径
openskills install ./local-skills/my-skill

# 主目录
openskills install ~/my-skills/custom-skill

# 从目录安装所有技能
openskills install ./my-skills-folder
```

### 从私有 Git 仓库安装

```bash
# SSH（使用你的 SSH 密钥）
openskills install git@github.com:your-org/private-skills.git

# HTTPS（可能提示输入凭据）
openskills install https://github.com/your-org/private-skills.git
```

### 同步选项

```bash
# 同步到默认 AGENTS.md
openskills sync

# 同步到自定义文件（如果缺失则自动创建）
openskills sync --output .ruler/AGENTS.md
openskills sync -o custom-rules.md

# 非交互式（用于 CI/CD）
openskills sync -y
```

### 默认交互式

所有命令默认使用美观的 TUI：

**安装：**
```bash
openskills install anthropics/skills
# → 复选框选择要安装的技能
# → 显示技能名称、描述、大小
# → 默认全部选中
```

**同步：**
```bash
openskills sync
# → 复选框选择要包含在 AGENTS.md 中的技能
# → 预选已在 AGENTS.md 中的技能
# → 空选择会删除技能部分
```

**管理：**
```bash
openskills manage
# → 复选框选择要删除的技能
# → 默认不选中任何内容（安全）
```

### 仓库管理

OpenSkills 支持将技能上传到 Git 仓库，方便分享和管理自定义技能。

**添加仓库：**
```bash
# 添加 GitHub 仓库（SSH）
openskills repo add my-skills git@github.com:your-org/my-skills.git

# 添加 GitHub 仓库（HTTPS）
openskills repo add my-skills https://github.com/your-org/my-skills.git

# 添加其他 Git 仓库
openskills repo add company-skills https://git.company.com/team/skills.git
```

**列出配置的仓库：**
```bash
openskills repo list
# → 显示所有已配置的仓库名称、URL 和添加日期
```

**删除仓库：**
```bash
openskills repo remove my-skills
# → 交互式确认删除（使用 -y 跳过确认）
```

### 上传技能到仓库

将已安装的技能上传到配置的 Git 仓库。技能会被放置在仓库的 `skills/<skill-name>/` 目录中。

**基本用法：**
```bash
# 交互式选择技能和仓库
openskills upload

# 上传指定技能（交互式选择仓库）
openskills upload pdf

# 指定仓库上传
openskills upload pdf --repo my-skills

# 上传多个技能（交互式多选）
openskills upload
# → 复选框选择要上传的技能
# → 选择目标仓库
```

**上传选项：**
```bash
# 指定提交信息
openskills upload pdf --repo my-skills --message "Update PDF skill with new features"

# 跳过所有确认提示（用于脚本/CI）
openskills upload pdf --repo my-skills --yes

# 组合使用
openskills upload --repo my-skills --message "Upload skills" --yes
```

**上传流程：**
1. 选择要上传的技能（支持多选）
2. 选择目标仓库（如果未指定 `--repo`）
3. 自动克隆或更新本地仓库副本（存储在 `~/.openskills/repos/`）
4. 将技能复制到 `skills/<skill-name>/` 目录
5. 自动移除技能中的 `.git` 目录（防止子模块问题）
6. 提交更改并推送到远程仓库

**注意事项：**
- 如果技能已存在于仓库中，会提示是否覆盖（使用 `--yes` 自动覆盖）
- 上传前会自动清理技能中的 `.git` 目录，确保作为普通文件而非子模块添加
- 需要配置 Git 用户信息（`git config --global user.name` 和 `user.email`）
- 需要配置 Git 认证（SSH 密钥或凭证助手）以推送到远程仓库

**示例工作流：**
```bash
# 1. 添加仓库
openskills repo add my-skills git@github.com:your-org/my-skills.git

# 2. 安装或开发技能
openskills install anthropics/skills
# 或开发自定义技能到 .claude/skills/my-custom-skill/

# 3. 上传技能
openskills upload my-custom-skill --repo my-skills

# 4. 其他人可以安装
openskills install your-org/my-skills
```

---

## 示例技能

来自 Anthropic 的[技能仓库](https://github.com/anthropics/skills)：

- **xlsx** — 电子表格创建、编辑、公式、数据分析
- **docx** — 带跟踪更改和注释的文档创建
- **pdf** — PDF 操作（提取、合并、拆分、表单）
- **pptx** — 演示文稿创建和编辑
- **canvas-design** — 创建海报和视觉设计
- **mcp-builder** — 构建模型上下文协议服务器
- **skill-creator** — 编写技能的详细指南

浏览全部：[github.com/anthropics/skills](https://github.com/anthropics/skills)

---

## 创建你自己的技能

### 最小结构

```
my-skill/
└── SKILL.md
    ---
    name: my-skill
    description: What this does and when to use it
    ---

    # Instructions in imperative form

    When the user asks you to X, do Y...
```

### 带捆绑资源

```
my-skill/
├── SKILL.md
├── references/
│   └── api-docs.md      # 支持文档
├── scripts/
│   └── process.py       # 辅助脚本
└── assets/
    └── template.json    # 模板、配置
```

在你的 SKILL.md 中，引用资源：
```markdown
1. Read the API documentation in references/api-docs.md
2. Run the process.py script from scripts/
3. Use the template from assets/template.json
```

代理在加载技能时看到基目录：
```
Loading: my-skill
Base directory: /path/to/.claude/skills/my-skill

[SKILL.md content]
```

### 发布

1. 推送到 GitHub：`your-username/my-skill`
2. 用户安装：`openskills install your-username/my-skill`

### 使用符号链接进行本地开发

对于活跃的技能开发，将技能符号链接到技能目录：

```bash
# 克隆你正在开发的技能仓库
git clone git@github.com:your-org/my-skills.git ~/dev/my-skills

# 符号链接到项目的技能目录
mkdir -p .claude/skills
ln -s ~/dev/my-skills/my-skill .claude/skills/my-skill

# 现在对 ~/dev/my-skills/my-skill 的更改会立即反映
openskills list  # 显示 my-skill
openskills sync  # 在 AGENTS.md 中包含 my-skill
```

这种方法让你：
- 在你喜欢的位置编辑技能
- 在版本控制下保持技能
- 无需重新安装即可立即测试更改
- 通过符号链接在多个项目之间共享技能

### 编写指南

使用 Anthropic 的 skill-creator 获取详细指导：

```bash
openskills install anthropics/skills
openskills read skill-creator
```

这会加载关于以下内容的全面指令：
- 编写有效的技能描述
- 为代理构建指令
- 使用捆绑资源
- 测试和迭代

---

## 要求

- **Node.js** 20.6+（用于 ora 依赖）
- **Git**（用于克隆仓库）

---

## 许可证

Apache 2.0

## 归属

实现了 [Anthropic 的代理技能](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) 规范。

**与 Anthropic 无关。** Claude、Claude Code 和代理技能是 Anthropic, PBC 的商标。
