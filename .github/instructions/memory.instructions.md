---
applyTo: '**'
---

# Development Instructions - Arizona Observatory Project

## CRITICAL AGENT INSTRUCTIONS

### Server Management Rules:
- **NEVER start development servers automatically** (npm run dev, npm start, etc.)
- **NEVER restart servers** without explicit user permission
- **ALWAYS notify user when changes are complete** and let them restart the server
- **User prefers to control server lifecycle** due to port conflicts and system management
- When work is finished, simply state: "Changes complete. Please restart your server to see the updates."

### Code Complexity Rules:
- **NEVER add complexity when you see unnecessary steps**
- **ALWAYS opt for simplifying and removing unnecessary complexity**
- **NEVER stack conversions on top of existing conversions**
- **Question every data transformation - eliminate intermediate steps**
- **Use the simplest, most direct approach possible**

## Evidence-Based Systematic Debugging Framework

### Meta-Prime Principle System
Universal methodology for systematic problem-solving:

1. **Evidence Collection**: Gather concrete data before theorizing
2. **Systematic Validation**: Test each hypothesis methodically  
3. **Root Cause Analysis**: Trace problems to their fundamental source
4. **Pattern Recognition**: Extract transferable principles from specific cases
5. **Documentation**: Record findings for future reference

### Universal Debugging Process
1. **Define the Problem**: Specific, measurable symptoms
2. **Collect Evidence**: Error messages, logs, behavior patterns
3. **Form Hypotheses**: Based on evidence, not assumptions
4. **Test Systematically**: One variable at a time
5. **Validate Solutions**: Confirm the fix addresses root cause
6. **Extract Principles**: Identify patterns applicable to future problems

### Prime Debugging Principles
- **Parameter Mapping**: Always verify data transformations match expected formats
- **Interface Contracts**: Validate inputs/outputs at system boundaries
- **Evidence Over Assumption**: Debug with concrete data, not theories
- **Systematic Over Random**: Follow methodical processes, avoid trial-and-error
- **Root Cause Focus**: Fix underlying issues, not just symptoms

### Meta-Learning Framework
For extracting universal principles from specific solutions:
1. **Document the Specific**: What exactly was the problem and solution?
2. **Extract the Pattern**: What universal principle made this work?
3. **Identify Domains**: Where else does this principle apply?
4. **Formalize the Rule**: How to apply this principle generally?
5. **Validate Transfer**: Test the principle in different contexts

## Project Context for Development

### Observatory Automation Mission
- Building automated astrophotography system for unattended operation
- Focus on weather integration, observation planning, equipment control
- Phoenix area astronomical conditions and Clear Sky Chart integration
- Goal: Sunset-to-sunrise automated sessions without human intervention

### Technical Requirements
- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript throughout with strict typing
- **Styling**: Tailwind CSS with design tokens
- **Architecture**: Clean component structure, responsive design
- **Performance**: Optimized for real-world observatory use

### Key Development Areas
- Weather monitoring and forecasting integration
- Observation planning and scheduling interfaces
- Equipment control and automation systems
- Remote monitoring and alerting capabilities
- Clear Sky Chart parsing and display
- Mobile-responsive interfaces for field use

## Coding Standards
- Use TypeScript with comprehensive type definitions
- Follow Next.js 14 best practices and App Router patterns
- Implement responsive design with Tailwind CSS utilities
- Create reusable, well-documented components
- Optimize for performance and accessibility
- Write clear, self-documenting code with appropriate comments
