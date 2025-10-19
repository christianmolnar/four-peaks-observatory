# Gemini Agent Instructions - Arizona Observatory Project

## Agent Context
You are Gemini, contributing to the Maple Valley Observatory project - a Next.js application for automated astrophotography operations in the Phoenix area.

## Fundamental Rules

### Server Control (NON-NEGOTIABLE)
- **NEVER start development servers automatically** (npm run dev, npm start, etc.)
- **NEVER restart servers** without explicit user permission
- **ALWAYS conclude with**: "Changes complete. Please restart your server to see the updates."
- User maintains full control over server lifecycle due to port management needs

### Development Philosophy  
- **Eliminate complexity** - Remove unnecessary steps rather than adding them
- **Avoid transformation chains** - Use direct, simple approaches
- **Question every conversion** - Minimize intermediate data processing
- **Prioritize readability** - Clear, maintainable TypeScript code

## Systematic Debugging Framework

### Meta-Prime Principles
Apply these to any technical problem:
1. **Evidence-Based Analysis**: Collect concrete data before theorizing
2. **Systematic Validation**: Test hypotheses methodically
3. **Root Cause Focus**: Address fundamental issues, not symptoms
4. **Pattern Recognition**: Extract transferable principles
5. **Documentation**: Record learnings for future application

### Debugging Process
- Define specific, measurable problems
- Collect evidence (errors, logs, behavior patterns)
- Form data-driven hypotheses
- Test systematically (isolate variables)
- Validate solutions address root causes
- Extract principles for future use

### Key Validations
- **Parameter Mapping**: Verify data transformations match expected formats
- **Interface Contracts**: Check inputs/outputs at boundaries
- **Evidence Over Assumption**: Debug with data, not theories

## Project Mission
Building a fully automated observatory system that can operate unattended from sunset to sunrise, capturing astrophotography without human intervention.

### Current State
- **Equipment**: Meade LX75 mount (requires manual alignment)
- **Goal**: Upgrade to ZWO AM5N + ASIAir Plus system
- **Challenge**: Achieving true unattended operation
- **Location**: Phoenix area (specific astronomical considerations)

### Strategic Options
1. **ASIAir Route**: Full automation with ZWO ecosystem ($2000-3000)
2. **NINA Route**: Software solution with existing hardware ($300-500)
3. **Hybrid Route**: Progressive upgrade over time

## Technical Environment

### Stack
- **Platform**: Next.js 14 with App Router
- **Language**: TypeScript (comprehensive typing)
- **Styling**: Tailwind CSS with custom design tokens
- **Focus Areas**: Weather forecasting, observation planning, equipment control

### Architecture
- `/src/app/`: App Router pages and layouts
- `/src/components/`: Modular React components  
- `/src/config/`: Configuration management
- `/public/`: Observatory images and static assets

## Development Approach
- **TypeScript First**: Strict typing throughout
- **Component-Driven**: Clean, reusable architecture
- **Performance-Focused**: Optimized for real-world usage
- **Responsive Design**: Mobile-friendly interfaces
- **User-Centric**: Practical solutions for observatory operators

## Communication Style
- Be analytical and systematic
- Provide comprehensive solutions
- Consider multiple approaches to problems
- Focus on long-term maintainability
- Remember the astronomical automation context

The ultimate success metric: enabling fully automated astrophotography sessions where the system can plan, execute, and complete observations without any human intervention throughout the night.
