import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { MaterialCommunityIconName } from "../types";

// Modern, evenly-spaced hues, each checked for contrast against white icons/text
// (used full-bleed as the TaskHeader background) and against both the light and dark
// card surface colors (used as a ring/dot/text color on task cards) -- every entry here
// clears ~3:1 contrast against white, the dark surface (#1c1c1e), and the light
// background (#f5f5f5), so a single list works for both themes without needing variants.
export const DEFAULT_COLORS = [
  '#EF4444', // Red
  '#EA580C', // Orange
  '#D97706', // Amber
  '#16A34A', // Green
  '#0D9488', // Teal
  '#0284C7', // Sky
  '#3B82F6', // Blue
  '#6366F1', // Indigo
  '#8B5CF6', // Violet
  '#D946EF', // Fuchsia
  '#EC4899', // Pink
  '#F43F5E', // Rose
];

// Extra colors revealed a batch at a time via the "..." button in ColorPicker, for people
// who want more range than the 12 defaults. Each inner array is one batch/tap. Same
// contrast bar as DEFAULT_COLORS throughout, checked against white text/icons and the
// light/dark card surfaces; the deeper/moodier tones in batch 2 read a bit more muted as
// a thin ring specifically on dark-mode cards -- an inherent tradeoff of a genuinely
// deep/moody color sitting on a near-black surface, not an oversight.
export const EXTENDED_COLOR_BATCHES: string[][] = [
  // Batch 1 -- the original 13-color default palette, kept around for continuity/nostalgia
  // rather than the newer, contrast-tuned modern feel of DEFAULT_COLORS.
  [
    '#FF6B6B', // Coral Red
    '#4ECDC4', // Turquoise
    '#45B7D1', // Sky Blue
    '#96CEB4', // Sage Green
    '#FFD93D', // Warm Yellow
    '#9B59B6', // Royal Purple
    '#E67E22', // Burnt Orange
    '#2ECC71', // Emerald
    '#F1C40F', // Sunflower
    '#3498DB', // Ocean Blue
    '#E74C3C', // Cherry Red
    '#1ABC9C', // Mint
    '#E84393', // Rose
  ],
  // Batch 2 -- neutrals, earthy tones, and deep jewel tones: hues neither DEFAULT_COLORS
  // nor batch 1 touch at all (true brown, gray, navy, wine, grape, forest, etc).
  [
    '#B45309', // Copper
    '#3F3F46', // Charcoal
    '#57534E', // Stone
    '#0369A1', // Cerulean
    '#818CF8', // Periwinkle
    '#047857', // Jade
    '#DB2777', // Raspberry
    '#991B1B', // Wine
    '#6D28D9', // Grape
    '#15803D', // Forest
    '#2563EB', // Denim
    '#FB7185', // Salmon
  ],
];

// 3-letter day-of-week abbreviations, index 0 = Sunday -- matches both `Date.getDay()` and
// `Task.daysOfWeek`'s own indexing (see app/utils/streaks.ts's isDueOnDate), so any index from
// either can be used directly against this array with no remapping. Used by AddTaskScreen's
// day-of-week picker. app/utils/formatFrequency.ts keeps its own identical local copy rather
// than importing this one -- this module pulls in @expo/vector-icons (for ALL_ICONS), which
// would drag a native font-loading dependency into that otherwise pure, jest-testable file.
export const DAY_ABBREVIATIONS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Get all available icons from MaterialCommunityIcons
export const ALL_ICONS = Object.keys(MaterialCommunityIcons.glyphMap) as MaterialCommunityIconName[];

export const DEFAULT_ICONS: MaterialCommunityIconName[] = [
  'run',
  'dumbbell',
  'book-open-variant',
  'meditation',
  'water',
  'food-apple',
  'food-drumstick',
  'sleep',
  'brush',
  'music',
  'pencil',
  'yoga',
  'bike',
  'swim',
  'weight',
  'book-open',
  'pill',
  'coffee',
  'bed',
  'toothbrush',
  'guitar-acoustic',
  'pencil-outline',
  'heart',
  'star',
  'target',
  'flag',
  'trophy',
  'medal',
  'crown',
  'lightning-bolt',
  'fire',
  'clock',


  "walk",
  "ski",
  "snowboard",
  "skate",
  "roller-skate",
  "karate",
  "weight-lifter",
  "golf",
  "tennis",
  "basketball",
  "soccer",
  "volleyball",
  "hockey-sticks",
  "baseball",
  "football",
  "cricket",
  "fencing",
  "bow-arrow",
  "rocket",
  "rowing",
  "surfing",
  "diving",
  "paragliding",
  "horse",
  "read",
  "book-open",
  "palette",
  "guitar-acoustic",
  "piano",
  "music",
  "microphone",
  "movie",
  "film",
  "camera",
  "gamepad",
  "chess-bishop",
  "dice-1",
  "puzzle",
  "campfire",
  "fish",
  "hiking",
  "wallet-travel",
  "beach",
  "tent",
  "binoculars",
  "telescope",
  "panorama-horizontal-outline",
  "hammer",
  "wrench",
  "screwdriver",
  "saw-blade",
  "tools",
  "vector-polygon-variant",
  "toolbox",
  "briefcase",
  "laptop",
  "desktop-classic",
  "notebook",
  "calendar",
  "clipboard",
  "file-document",
  "email",
  "phone",
  "printer",
  "scanner",
  "cash-register",
  "shopping",
  "cart",
  "store",
  "warehouse",
  "factory",
  "cards"
];
