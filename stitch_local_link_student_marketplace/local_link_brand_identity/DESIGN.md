---
name: Local Link Brand Identity
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#434656'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#737688'
  outline-variant: '#c3c5d9'
  surface-tint: '#004ced'
  primary: '#003ec7'
  on-primary: '#ffffff'
  primary-container: '#0052ff'
  on-primary-container: '#dfe3ff'
  inverse-primary: '#b7c4ff'
  secondary: '#006b5b'
  on-secondary: '#ffffff'
  secondary-container: '#26fedc'
  on-secondary-container: '#007261'
  tertiary: '#464d67'
  on-tertiary: '#ffffff'
  tertiary-container: '#5e6580'
  on-tertiary-container: '#dfe3ff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dde1ff'
  primary-fixed-dim: '#b7c4ff'
  on-primary-fixed: '#001452'
  on-primary-fixed-variant: '#0038b6'
  secondary-fixed: '#26fedc'
  secondary-fixed-dim: '#00dfc1'
  on-secondary-fixed: '#00201a'
  on-secondary-fixed-variant: '#005144'
  tertiary-fixed: '#dce1ff'
  tertiary-fixed-dim: '#bfc5e4'
  on-tertiary-fixed: '#141a32'
  on-tertiary-fixed-variant: '#3f465f'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
typography:
  headline-xl:
    fontFamily: Spline Sans
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Spline Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Spline Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  xs: 4px
  sm: 12px
  md: 24px
  lg: 40px
  xl: 64px
  gutter: 20px
  margin: 24px
---

## Brand & Style

The design system is built to bridge the gap between student ambition and consumer trust. It embodies an "Energetic Professionalism" style—a hybrid of **Modern Corporate** reliability and **High-Contrast Bold** energy. The visual language is designed to feel approachable and youthful to encourage student participation, while maintaining a structured, polished aesthetic that gives adult customers confidence in the marketplace. 

The system utilizes heavy whitespace to keep the high-energy colors from feeling overwhelming, ensuring that the primary focus remains on the "Local" connection. It avoids the rigidity of traditional finance apps in favor of a bouncy, fluid feel that mirrors the drive of Gen-Z entrepreneurs.

## Colors

This design system utilizes a high-octane palette to signify movement and growth. 

- **Electric Blue (Primary):** Used for primary actions, navigation highlights, and the "Verified" status. It represents the "Link" between users.
- **Mint Green (Secondary):** Used for success states, growth indicators, and "New" tags. It provides a fresh, youthful contrast to the blue.
- **Navy (Tertiary):** Provides the professional anchor. Used for typography and deep backgrounds to ensure the platform feels grounded and secure.
- **Surface Neutrals:** A range of soft, cool grays are used to define card boundaries and secondary backgrounds, preventing the interface from feeling flat.

## Typography

The typography strategy pairs **Spline Sans** for headlines with **Plus Jakarta Sans** for body and UI elements. 

Headlines are set with tight tracking and bold weights to convey energy and urgency. Plus Jakarta Sans is chosen for its open counters and friendly terminals, ensuring that even dense business descriptions remain highly readable on mobile devices. The hierarchy prioritizes clear scanning, with large, punchy titles that lead directly into accessible body text.

## Layout & Spacing

The design system employs a **Fluid Grid** model based on a 12-column system for desktop and a 4-column system for mobile. 

A standard 8px spacing rhythm ensures consistency across all components. Generous margins and internal padding (md and lg) are used to maintain the "Friendly" feel, preventing the high-energy colors and bold typography from feeling cluttered. Lead cards and pricing tables should utilize the `lg` spacing for section breaks to create a sense of organized, professional clarity.

## Elevation & Depth

To achieve a "modern yet professional" feel, the design system uses **Ambient Shadows** rather than harsh borders. 

Depth is communicated through layered surfaces:
1. **Level 0 (Background):** Neutral Off-white (#F8FAFC).
2. **Level 1 (Cards):** Pure White with a subtle 12% opacity Navy shadow (20px blur, 4px Y-offset).
3. **Level 2 (Active/Hover States):** A more pronounced shadow with a hint of Electric Blue tinting to signal interactivity.

This "soft-elevation" approach keeps the UI feeling light and airy, avoiding the "heavy" look of traditional software.

## Shapes

The shape language is defined by a **Large Radius** (Level 2) to maximize the "friendly" and "accessible" brand traits. 

Large containers like cards use the `rounded-xl` (1.5rem) setting, while interactive elements like buttons and input fields use `rounded-lg` (1rem). Small indicators, such as tags or the "Verified" badge background, may utilize full pill-shaping (rounded-full) to create visual distinction from the primary structural elements.

## Components

### Buttons
Primary buttons use a solid Electric Blue background with white text and a subtle drop shadow. Secondary buttons use a Mint Green background for "Action Success" or an outlined Navy style for "Management" tasks. All buttons have a minimum height of 48px to remain accessible on mobile.

### Verified Badges
The "Verified" badge is a 24px circular component featuring an Electric Blue background and a white checkmark icon. It should always appear immediately to the right of a business name to establish instant credibility.

### Lead Cards
Cards feature a 1.5rem corner radius and use Level 1 elevation. They include a Mint Green header-accent or "tag" for categories. The "Call to Action" on these cards should be prominent and right-aligned.

### Pricing Tables
Subscription tables use a 3-column layout. The "Recommended" or "Most Popular" plan is highlighted with a 2px Electric Blue border and a slightly larger scale than the flanking plans. Each plan tier must clearly list features with Mint Green checkmarks to signify value.

### Input Fields
Inputs use a soft gray background and a 1rem radius. On focus, the border transitions to a 2px Electric Blue stroke with a soft glow effect. Label text should sit above the field in Navy Bold (label-md).