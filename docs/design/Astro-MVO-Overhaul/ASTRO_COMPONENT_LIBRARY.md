# Astro Component Library Documentation

## Overview

The Maple Valley Observatory Astro component library provides a consistent set of reusable UI components following the observatory's design system. All components feature glass morphism effects, amber accent colors, and responsive design.

## Components

### Button Component

**File**: `src/components/ui/Button.astro`

A versatile button component supporting multiple variants, sizes, and both button and link functionality.

**Props**:
- `variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'` - Visual style variant
- `size?: 'sm' | 'md' | 'lg'` - Button size 
- `href?: string` - If provided, renders as link instead of button
- `type?: 'button' | 'submit' | 'reset'` - Button type (when not href)
- `disabled?: boolean` - Disabled state
- `class?: string` - Additional CSS classes

**Usage**:
```astro
<Button variant="primary" size="lg">Primary Action</Button>
<Button href="/contact" variant="outline">Contact Us</Button>
<Button variant="danger" disabled>Disabled Button</Button>
```

**Variants**:
- `primary`: Amber background, main call-to-action style
- `secondary`: Subtle background, secondary actions
- `outline`: Transparent with border, tertiary actions
- `ghost`: Minimal styling, navigation or utility actions
- `danger`: Red background, destructive actions

### Card Component

**File**: `src/components/ui/Card.astro`

A flexible container component with glass morphism effects and multiple styling variants.

**Props**:
- `variant?: 'default' | 'glass' | 'solid' | 'minimal'` - Visual style variant
- `padding?: 'none' | 'sm' | 'md' | 'lg'` - Internal padding
- `class?: string` - Additional CSS classes
- `hover?: boolean` - Enable hover effects

**Usage**:
```astro
<Card variant="glass" padding="md" hover>
  <h3>Card Title</h3>
  <p>Card content goes here</p>
</Card>
```

**Variants**:
- `default`: Standard glass effect with subtle backdrop blur
- `glass`: Enhanced glass morphism with more pronounced blur
- `solid`: Solid background for high contrast content
- `minimal`: Transparent background, minimal styling

### Input Component

**File**: `src/components/ui/Input.astro`

Styled input field with consistent theming and focus states.

**Props**:
- `type?: 'text' | 'email' | 'password' | 'number' | 'tel' | 'url'` - Input type
- `placeholder?: string` - Placeholder text
- `value?: string` - Input value
- `required?: boolean` - Required field
- `disabled?: boolean` - Disabled state
- `class?: string` - Additional CSS classes
- `name?: string` - Input name attribute
- `id?: string` - Input ID attribute

**Usage**:
```astro
<Input type="email" placeholder="your@email.com" required />
<Input type="password" placeholder="Password" />
```

### Textarea Component

**File**: `src/components/ui/Textarea.astro`

Multi-line text input with consistent styling.

**Props**:
- `placeholder?: string` - Placeholder text
- `value?: string` - Textarea value
- `required?: boolean` - Required field
- `disabled?: boolean` - Disabled state
- `rows?: number` - Number of visible rows (default: 4)
- `class?: string` - Additional CSS classes
- `name?: string` - Textarea name attribute
- `id?: string` - Textarea ID attribute

**Usage**:
```astro
<Textarea placeholder="Enter your message..." rows={6} required />
```

### LoadingSpinner Component

**File**: `src/components/ui/LoadingSpinner.astro`

Animated loading spinner for async operations.

**Props**:
- `size?: 'sm' | 'md' | 'lg'` - Spinner size
- `color?: 'white' | 'amber' | 'blue'` - Spinner color
- `class?: string` - Additional CSS classes

**Usage**:
```astro
<LoadingSpinner size="md" color="amber" />
```

### Footer Component

**File**: `src/components/Footer.astro`

Site-wide footer with observatory information, navigation links, and social media links.

**Features**:
- Observatory information from config
- Navigation links to main sections
- Social media integration
- Clear Sky Chart link
- Responsive grid layout

**Usage**:
```astro
<Footer />
```

## Design System

### Colors

The component library uses the observatory's color palette:

- **Primary**: Amber (`#f59e0b` family) - Main accent color
- **Background**: Black with transparency layers
- **Text**: White with opacity variations (100%, 90%, 80%, 70%, 60%, 50%)
- **Borders**: White with low opacity for glass effects
- **Danger**: Red (`#dc2626` family) for destructive actions

### Glass Morphism

Components use backdrop-blur and transparency effects:

- `backdrop-blur-sm`: 8px blur for subtle effects
- `backdrop-blur-md`: 12px blur for enhanced glass look
- Background opacity: `bg-white/5` to `bg-white/20`
- Border opacity: `border-white/10` to `border-white/30`

### Typography

- **Font Family**: Poppins (consistent with site)
- **Font Weights**: 200 (light), 300 (normal), 400 (medium), 500 (semibold), 600 (bold)
- **Letter Spacing**: `tracking-wide` for headings, `tracking-wider` for large titles

### Spacing

Consistent padding and margin scales:

- `sm`: 12px (3 units)
- `md`: 16px (4 units) 
- `lg`: 24px (6 units)
- `xl`: 32px (8 units)

## Usage Patterns

### Form Layout

```astro
<Card variant="glass" padding="lg">
  <form class="space-y-4">
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Input type="text" placeholder="Name" required />
      <Input type="email" placeholder="Email" required />
    </div>
    <Textarea placeholder="Message" rows={4} />
    <Button type="submit" variant="primary">Send Message</Button>
  </form>
</Card>
```

### Statistics Display

```astro
<Card variant="default" padding="md" hover>
  <div class="text-center">
    <div class="text-3xl font-bold text-amber-400 mb-2">135</div>
    <div class="text-white/70 text-sm">Total Images</div>
  </div>
</Card>
```

### Navigation Cards

```astro
<Card variant="glass" padding="md">
  <h3 class="text-white font-semibold mb-4">Quick Links</h3>
  <div class="space-y-2">
    <Button href="/gallery" variant="ghost" class="w-full justify-start">
      🌌 Gallery
    </Button>
    <Button href="/contact" variant="ghost" class="w-full justify-start">
      📧 Contact
    </Button>
  </div>
</Card>
```

## Migration Notes

When migrating from Next.js components:

1. **Replace JSX with Astro syntax**: Use `{condition && <element />}` or `{condition ? <a> : <b>}`
2. **Update imports**: Use relative paths instead of `@/` aliases
3. **Props interface**: Define in frontmatter with TypeScript interfaces
4. **Styling**: Classes are applied directly, no `className` prop
5. **Event handlers**: Client-side interaction requires Astro Islands or `<script>` tags

## Build Integration

All components are included in the Astro build process:

- **Build time**: ~726ms with full optimization
- **Bundle size**: Minimal impact due to Astro's optimization
- **Cache**: Images and styles cached for subsequent builds
- **Types**: Full TypeScript support with prop validation

## Future Enhancements

Planned component additions:

- **Modal/Dialog** - For overlay content
- **Tabs** - For admin interface migration  
- **Table** - For data display
- **Badge/Tag** - For categorization
- **Tooltip** - For additional information
- **ProgressBar** - For loading states
- **Toast/Alert** - For user feedback
