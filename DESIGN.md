---
name: Fleet Modernist
colors:
  surface: '#f7faf9'
  surface-dim: '#d7dbda'
  surface-bright: '#f7faf9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f1f4f3'
  surface-container: '#ebeeed'
  surface-container-high: '#e6e9e8'
  surface-container-highest: '#e0e3e2'
  on-surface: '#181c1c'
  on-surface-variant: '#3f494a'
  inverse-surface: '#2d3131'
  inverse-on-surface: '#eef1f0'
  outline: '#6f797a'
  outline-variant: '#bec8ca'
  surface-tint: '#006972'
  primary: '#005159'
  on-primary: '#ffffff'
  primary-container: '#006b75'
  on-primary-container: '#99e9f4'
  inverse-primary: '#84d3de'
  secondary: '#825500'
  on-secondary: '#ffffff'
  secondary-container: '#feaa00'
  on-secondary-container: '#684300'
  tertiary: '#00505f'
  on-tertiary: '#ffffff'
  tertiary-container: '#006a7d'
  on-tertiary-container: '#95e8ff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#a0effb'
  primary-fixed-dim: '#84d3de'
  on-primary-fixed: '#001f23'
  on-primary-fixed-variant: '#004f56'
  secondary-fixed: '#ffddb3'
  secondary-fixed-dim: '#ffb950'
  on-secondary-fixed: '#291800'
  on-secondary-fixed-variant: '#624000'
  tertiary-fixed: '#adecff'
  tertiary-fixed-dim: '#5dd6f3'
  on-tertiary-fixed: '#001f26'
  on-tertiary-fixed-variant: '#004e5d'
  background: '#f7faf9'
  on-background: '#181c1c'
  surface-variant: '#e0e3e2'
typography:
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '700'
    lineHeight: 24px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 24px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 28px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  container-margin: 16px
  gutter: 12px
---

## Brand & Style

The design system prioritizes a **Corporate Modern** aesthetic tailored for logistical efficiency and high-density information management. The brand personality is professional, reliable, and systematic, aiming to evoke a sense of order and operational control for fleet managers.

Drawing from the clean, structured approach of the booking interface, this system utilizes high-contrast functional elements against a neutral backdrop. It balances a utilitarian core with soft, approachable geometry to ensure long-term usability without visual fatigue. The emotional response should be one of "effortless oversight"—where critical data is immediately legible and complex actions, like reassigning drivers, feel light and intentional.

## Colors

This design system uses a palette rooted in industrial precision. The **Primary Teal** (#006B75) serves as the anchor for navigation and primary actions, providing a calm but authoritative presence. The **Secondary Orange** (#FFAB00) is reserved for high-priority calls to action, such as creating new bookings or critical alerts, ensuring they stand out within the predominantly cool-toned interface.

The background uses a soft **Neutral Gray** (#F4F7F6) to reduce glare, while cards and surfaces utilize pure white to establish a clear hierarchy. Subtle borders replace heavy shadows to maintain a flat, clean look inspired by the reference booking page.

## Typography

The system utilizes **Plus Jakarta Sans** across all levels to maintain a contemporary and highly readable feel. Typography is used to create a clear scan-path:
- **Headlines** are bold and dark to anchor sections.
- **Body Text** uses a lighter weight and softer gray for secondary information like addresses or timestamps.
- **Labels** are uppercase and slightly tracked out when used in badges or chips to distinguish them from interactive text.

Vertical rhythm is maintained through a strict line-height scale, ensuring that even in dense driver management lists, the text remains breathable.

## Layout & Spacing

This design system employs a **Fixed-Fluid Hybrid Grid**. On mobile devices, content follows a single-column stack with 16px side margins. On larger screens, content is housed within a centered container to prevent line lengths from becoming excessive.

Spacing follows a 4px baseline shift. Components like driver cards use 16px of internal padding (`md`) to ensure touch targets are accessible. Gutters between cards are kept tight (12px) to allow more information to be visible on the screen at once, reflecting the high-density requirements of fleet management.

## Elevation & Depth

Depth is primarily achieved through **Low-Contrast Outlines** rather than heavy shadows. Cards use a 1px border (#E0E4E3) and a very soft, high-diffusion shadow (0px 2px 8px rgba(0,0,0,0.04)) to lift them slightly from the neutral background.

Interactive layers, such as the "Reassign Driver" modal or dropdowns, use a more pronounced shadow to indicate they sit atop the primary interface. Tonal layering is used for status indicators—where a light tinted background (e.g., light teal for "Active") provides depth without adding visual noise.

## Shapes

The shape language is **Rounded**, using a 0.5rem (8px) corner radius for most standard components like cards and input fields. This provides a professional but modern silhouette. 

Larger containers, such as the bottom navigation bar and primary action buttons, utilize a more pronounced radius (1rem) to differentiate them from static content. Pill-shaped elements are strictly reserved for status badges (e.g., "Completed", "On Duty") to signify they are non-interactive informational tags.

## Components

### Driver Management Cards
Cards are the primary container. They feature a 2px teal left-border highlight to indicate "Active" status. The card header contains the Vehicle ID and Driver name in high-contrast text. 

### Integrated Reassign Action
The "Reassign Driver" function is integrated as a secondary ghost button within the card footer or as a trailing icon action. This replaces the need for a separate management screen, allowing fleet adjustments directly from the list.

### Buttons & Chips
- **Primary Button:** Solid Teal or Orange with white text, rounded corners.
- **Ghost Buttons:** Teal outline with teal text, used for secondary actions like "Message Driver".
- **Status Chips:** Light background tint with a small colored dot prefix to denote status (Online, Offline, In-Trip).

### Inputs & Filters
Date and status filters follow the horizontal scrolling pill format seen in the booking reference, allowing for quick narrowing of the fleet list without taking up vertical real estate.