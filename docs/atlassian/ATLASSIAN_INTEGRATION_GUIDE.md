# Atlassian Integration Guide
## Observatory Astro Migration Project

**Created**: December 19, 2024  
**Purpose**: Use Atlassian tools for the Astro migration project management

---

## Project Setup Overview

We'll create a new Atlassian project called **"Observatory Astro Migration"** to manage the migration from Next.js to Astro using:

- **Jira**: Task and sprint management
- **Confluence**: Documentation and knowledge base
- **Bitbucket**: Code repository and pull requests (optional)

---

## Step 1: Create New Jira Project

### Project Details
- **Project Name**: Observatory Astro Migration
- **Project Key**: OAM
- **Project Type**: Software Development (Scrum)
- **Description**: Migration of Maple Valley Observatory website from Next.js to Astro framework

### Initial Setup Tasks
1. Create project in Jira
2. Set up project components:
   - Frontend Migration
   - Content Management
   - Performance Optimization
   - Documentation
   - Testing & Validation

3. Configure project settings:
   - Enable story points estimation
   - Set up custom fields for migration tracking
   - Configure workflows for development process

---

## Step 2: Create Confluence Space

### Space Details
- **Space Name**: Observatory Astro Migration
- **Space Key**: OAM
- **Description**: Documentation and knowledge base for the observatory website migration project

### Initial Pages Structure
```
Observatory Astro Migration (Home)
├── 📋 Project Overview
├── 🎯 Migration Strategy
├── 📚 Technical Documentation
│   ├── Current Architecture Analysis
│   ├── Astro Framework Research
│   ├── Content Collections Design
│   └── Performance Benchmarks
├── 📝 Meeting Notes
├── 🚀 Sprint Documentation
└── 📖 Knowledge Base
    ├── Astro Best Practices
    ├── Content Migration Guidelines
    └── Troubleshooting Guide
```

---

## Step 3: Jira Epic and Story Structure

### Epic Structure
Based on our 5-phase migration plan:

#### Epic 1: Foundation Setup (OAM-1)
**Story Points**: 21
**Sprint**: 1-2

**Stories**:
- OAM-2: Research Astro framework capabilities (3 pts)
- OAM-3: Set up Astro development environment (5 pts)
- OAM-4: Configure TypeScript and tooling (3 pts)
- OAM-5: Design content collections schema (5 pts)
- OAM-6: Set up build pipeline (5 pts)

#### Epic 2: Content Migration (OAM-7)
**Story Points**: 34
**Sprint**: 3-5

**Stories**:
- OAM-8: Analyze existing content structure (3 pts)
- OAM-9: Create content migration scripts (8 pts)
- OAM-10: Migrate astrophotography content (8 pts)
- OAM-11: Migrate terrestrial photography content (5 pts)
- OAM-12: Migrate contemplative videos data (5 pts)
- OAM-13: Validate content integrity (5 pts)

#### Epic 3: Component Migration (OAM-14)
**Story Points**: 55
**Sprint**: 6-8

**Stories**:
- OAM-15: Convert layout components (8 pts)
- OAM-16: Migrate navigation system (8 pts)
- OAM-17: Convert gallery components (13 pts)
- OAM-18: Implement contemplative videos as islands (13 pts)
- OAM-19: Port SEO components (8 pts)
- OAM-20: Migrate styling system (5 pts)

#### Epic 4: Feature Implementation (OAM-21)
**Story Points**: 34
**Sprint**: 9-10

**Stories**:
- OAM-22: Implement search functionality (13 pts)
- OAM-23: Add RSS feed generation (5 pts)
- OAM-24: Configure sitemap generation (3 pts)
- OAM-25: Create 404 and error pages (5 pts)
- OAM-26: Performance optimization (8 pts)

#### Epic 5: Deployment & Go-Live (OAM-27)
**Story Points**: 21
**Sprint**: 11-12

**Stories**:
- OAM-28: Set up production build pipeline (8 pts)
- OAM-29: Configure Vercel static hosting (5 pts)
- OAM-30: Implement URL redirects (3 pts)
- OAM-31: Performance testing (5 pts)

---

## Step 4: Sprint Planning

### Sprint 1-2: Foundation (Weeks 1-2)
**Sprint Goal**: Establish Astro development environment and content structure
**Stories**: OAM-2 through OAM-6
**Total Story Points**: 21

### Sprint 3-5: Content Migration (Weeks 3-5) 
**Sprint Goal**: Migrate all existing content to Astro content collections
**Stories**: OAM-8 through OAM-13
**Total Story Points**: 34

### Sprint 6-8: Component Migration (Weeks 6-8)
**Sprint Goal**: Convert all React components to Astro format
**Stories**: OAM-15 through OAM-20
**Total Story Points**: 55

### Sprint 9-10: Feature Implementation (Weeks 9-10)
**Sprint Goal**: Complete feature set and optimize performance
**Stories**: OAM-22 through OAM-26
**Total Story Points**: 34

### Sprint 11-12: Deployment (Weeks 11-12)
**Sprint Goal**: Deploy to production and go live
**Stories**: OAM-28 through OAM-31
**Total Story Points**: 21

---

## Step 5: Confluence Documentation Structure

### Technical Documentation Templates

#### 1. Architecture Decision Record (ADR) Template
```markdown
# ADR-001: Migration to Astro Framework

## Status
Accepted

## Context
Current Next.js implementation has bundle size issues and is over-engineered for static content.

## Decision
Migrate to Astro framework for better performance and content management.

## Consequences
- Improved performance (40% faster loading)
- Reduced JavaScript bundle (90% less)
- Better content management with type safety
- Migration effort required (8-12 weeks)
```

#### 2. Sprint Retrospective Template
```markdown
# Sprint X Retrospective - Observatory Migration

## What Went Well
- 

## What Could Be Improved
- 

## Action Items
- [ ] 

## Metrics
- Velocity: X story points
- Burndown: On track / Behind / Ahead
- Bugs Found: X
- Performance Improvements: X%
```

#### 3. Technical Specification Template
```markdown
# Technical Spec: Content Collections Implementation

## Overview
Design and implement Astro content collections for observatory content.

## Requirements
- Type-safe content validation
- Preserve existing file structure  
- Support contemplative videos integration

## Implementation Details
[Technical details here]

## Testing Strategy
[Testing approach here]
```

---

## Step 6: Automation and Integration

### Jira Automation Rules
1. **Auto-assign to sprints**: When epic changes, update story sprint assignments
2. **Story completion**: Auto-move epic to review when all stories complete
3. **Documentation updates**: Create Confluence page when epic starts
4. **Performance tracking**: Update custom fields for performance metrics

### Confluence Macros for Project Tracking
- **Jira Issues Macro**: Display current sprint stories
- **Status Macro**: Show project phase progress
- **Roadmap Planner Macro**: Visual timeline of migration phases

---

## Step 7: Using Your Atlassian AI Assistant

Based on your VS Code extension, we can use these commands:

### Documentation Generation
1. **Generate Sprint Documentation**: Use AI to create sprint summaries
2. **Generate Code from Jira Story**: Auto-generate boilerplate code from story requirements
3. **Update Project Status**: Auto-update Confluence pages with current progress

### Project Management
1. **Check Current Sprints**: Monitor active sprint progress
2. **Open Sprint Planning Dashboard**: Plan upcoming sprints
3. **Generate Project Backlog**: Prioritize stories and epics

---

## Getting Started Checklist

### Immediate Actions (Today)
- [ ] Create new Jira project "Observatory Astro Migration"
- [ ] Create new Confluence space "Observatory Astro Migration" 
- [ ] Set up initial project structure in Jira
- [ ] Create first epic (Foundation Setup)
- [ ] Add team members to project

### Week 1 Actions
- [ ] Create all epics and stories in Jira
- [ ] Set up sprint schedule
- [ ] Create initial Confluence documentation
- [ ] Configure project automation rules
- [ ] Test Atlassian AI Assistant integration

### Ongoing Processes
- [ ] Daily standup updates in Jira
- [ ] Weekly sprint planning
- [ ] Sprint retrospectives in Confluence
- [ ] Performance metrics tracking
- [ ] Documentation updates

---

## Success Metrics

### Project Tracking
- **Velocity**: Target 15-20 story points per sprint
- **Burndown**: Stay within 10% of planned timeline
- **Quality**: <5 bugs per sprint
- **Documentation**: 100% coverage of major decisions

### Technical Metrics
- **Performance**: 40% improvement in page load time
- **Bundle Size**: 90% reduction in JavaScript
- **Content Migration**: 100% content preserved
- **Feature Parity**: All existing features maintained

---

## Next Steps

1. **Use your Atlassian AI Assistant** to create the new project
2. **Set up the Jira epics and stories** from the structure above
3. **Create the Confluence space** with initial documentation
4. **Begin Sprint 1** with foundation setup work
5. **Test the AI-generated code features** with first stories

This structure gives you a complete project management framework for the migration while testing all capabilities of your Atlassian extension!
