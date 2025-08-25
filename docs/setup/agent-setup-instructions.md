# Agent Setup Instructions for Beast Mode & shadcn/ui

Use this file in any repo to have your agent automatically set up Beast Mode, shadcn/ui, and agent memory features.

## 1. Create Agent Memory File
- Create the directory `.github/instructions` if it does not exist.
- Add a file named `memory.instruction.md` with the following content:

```
---
applyTo: '**'
---
```

## 2. Install & Initialize shadcn/ui
- Run the following command in your project root:

```
npx shadcn@latest init
```
- Follow the prompts to complete initialization.

## 3. Enable Agent Features
- Ensure your settings include:

```
"chat.tools.autoApprove": true,
"chat.agent.maxRequests": 100,
"chat.agent.enabled": true
```

## 4. Add UI Instructions (Optional)
- For shadcn/ui best practices, add a file with the latest UI instructions to `.github/instructions`.
- Always fetch the latest docs from https://ui.shadcn.com/docs/components before using any component.

---

**Copy this file to any repo and ask your agent to follow these steps for a complete setup.**
