# Development

Setup and contributing notes for Streakaholic. For what the app does, see [README.md](README.md). For architecture and data model details, see [CLAUDE.md](CLAUDE.md).

## Prerequisites

- Node.js (LTS) and npm
- Expo CLI, run via `npx expo` — no global install required
- Android Emulator for native development, or just a browser for web (used for quick functional testing, not a target platform)

## Getting Started

1. Clone the repository:
   ```bash
   git clone https://github.com/aaronbeall/streakaholic.git
   cd streakaholic
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm start
   ```
4. Run on a specific platform:
   ```bash
   npm run android  # Android Emulator
   npm run web      # Browser (functional testing only, not a target platform)
   ```

## Stack

- Expo SDK 54, expo-router (file-based routing), React 19 / React Native 0.81, TypeScript
- Zustand + `persist` middleware (AsyncStorage-backed) for state/persistence — see
  `app/stores/`; `ToastContext` is the one deliberate holdout still using React Context
- `react-native-reanimated` for animations, `react-native-chart-kit` for charts
- `@expo/vector-icons` (MaterialCommunityIcons) for icons

See [CLAUDE.md](CLAUDE.md) for the full architecture (state management, key `app/utils/`
modules, animation timing rules, RN/Android gotchas) — this doc is just setup steps.

## Project Structure

Routing is file-based under `app/`; each route file is a thin re-export of a screen in `app/screens/`.

```
app/
  ├── (route files)   # index, dashboard, add-task, settings, etc. — thin re-exports of screens
  ├── screens/        # Screen components
  ├── components/     # Reusable UI components
  ├── stores/         # Zustand stores (tasks, settings, achievements, last-import)
  ├── context/        # ToastContext — the one screen-crossing state still in React Context
  ├── hooks/          # Custom hooks (e.g. theming)
  ├── constants/      # Shared constants (brand copy, task icons/colors, tip jar tiers)
  ├── types/          # TypeScript type definitions
  └── utils/          # Utility functions (streaks, achievements, charts, import/export)
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
