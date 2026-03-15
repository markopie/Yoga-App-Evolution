# Dark Mode Implementation

This document describes the dark mode implementation for the Yoga Sequences application.

## Features

1. **CSS Custom Properties**: All colors are defined using CSS variables for easy theme switching
2. **Proper Color Contrast**: Both light and dark themes meet WCAG AA contrast requirements
3. **Persistent Storage**: User preference is saved to localStorage and synced to Supabase (when authenticated)
4. **System Preference Detection**: Respects `prefers-color-scheme` media query by default
5. **Smooth Transitions**: All color changes animate smoothly with configurable timing
6. **Accessibility**: Toggle button includes proper ARIA attributes for screen readers

## Files

- `styles/theme.css` - CSS variables and theming styles
- `src/ui/themeToggle.js` - Theme manager module
- Modified `app.js` - Initializes theme manager on startup
- Modified `src/ui/wiring.js` - Syncs theme preference when user authenticates

## Usage

The theme toggle button appears automatically in the header next to the sign-out button. Users can click it to switch between light and dark modes.

### For Developers

```javascript
import { themeManager } from './src/ui/themeToggle.js';

// Initialize (done automatically in app.js)
themeManager.init(userId);

// Manually toggle theme
themeManager.toggleTheme();

// Set user ID for Supabase sync
themeManager.setUserId(userId);
```

## Color Variables

All theme colors are defined in `styles/theme.css`:

- `--color-bg-*` - Background colors
- `--color-text-*` - Text colors
- `--color-border-*` - Border colors
- `--color-accent-*` - Accent/brand colors
- `--color-success/warning/error-*` - Status colors
- `--color-shadow-*` - Shadow colors

## Accessibility

- Color contrast ratios meet WCAG AA standards (4.5:1 for normal text, 3:1 for large text)
- Toggle button includes `aria-label` and `aria-pressed` attributes
- Respects `prefers-reduced-motion` for users who prefer minimal animations
- Works with keyboard navigation (button is focusable)

## Browser Support

The implementation uses modern CSS features and Web APIs:
- CSS Custom Properties (CSS Variables)
- `prefers-color-scheme` media query
- LocalStorage API
- Data attributes (`data-theme`)

All major browsers from the last 5 years are supported.
