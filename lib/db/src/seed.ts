import { db, drillsTable, type InsertDrill } from "./index";

const DRILLS: InsertDrill[] = [
  {
    name: "Corver Quick Touches",
    category: "corver",
    difficulty: "beginner",
    description:
      "Tap the ball side to side between the insides of both feet as fast as you can. Small, quick touches — the ball should never stop moving.",
    keyPoints: [
      "Stay on the balls of your feet",
      "Keep your knees slightly bent",
      "Small fast touches — don't let the ball get away",
    ],
    targetLegMotion:
      "Rapid alternating inside-foot taps with bent knees and centered balance",
    durationSeconds: 45,
    thumbnailEmoji: "⚡",
  },
  {
    name: "V-Pull Turns",
    category: "corver",
    difficulty: "intermediate",
    description:
      "Pull the ball back with the sole of your foot, then push it forward at an angle — your foot draws the letter V. Switch feet every rep.",
    keyPoints: [
      "Pull back with the sole, push with the inside of the foot",
      "Keep your head up between touches",
      "Bend the standing leg for balance",
    ],
    targetLegMotion:
      "Sole drag backward then diagonal inside-foot push, alternating legs",
    durationSeconds: 60,
    thumbnailEmoji: "✌️",
  },
  {
    name: "Toe Taps",
    category: "dribbling",
    difficulty: "beginner",
    description:
      "Tap the top of the ball with the bottom of your foot, switching feet like you're running in place on the ball.",
    keyPoints: [
      "Light touches on top of the ball",
      "Bounce on your standing foot",
      "Keep a steady rhythm — speed comes later",
    ],
    targetLegMotion:
      "Alternating sole taps on top of the ball with springy standing leg",
    durationSeconds: 45,
    thumbnailEmoji: "👟",
  },
  {
    name: "Sole Roll Dribble",
    category: "dribbling",
    difficulty: "intermediate",
    description:
      "Roll the ball from side to side using the sole of your foot, moving your body with the ball like a goalkeeper shuffling.",
    keyPoints: [
      "Roll the ball, don't kick it",
      "Move your whole body with the ball",
      "Stay low with bent knees",
    ],
    targetLegMotion:
      "Lateral sole rolls with low center of gravity and side shuffle",
    durationSeconds: 60,
    thumbnailEmoji: "🎢",
  },
  {
    name: "Juggling Starter",
    category: "juggling",
    difficulty: "beginner",
    description:
      "Drop the ball onto your foot, kick it up once and catch it. Then try two kicks, then three. How high can your streak go?",
    keyPoints: [
      "Lock your ankle when the ball lands on your foot",
      "Kick the ball to head height, not higher",
      "Keep your eyes on the ball",
    ],
    targetLegMotion:
      "Controlled instep lifts with locked ankle and slight knee bend",
    durationSeconds: 60,
    thumbnailEmoji: "🤹",
  },
  {
    name: "Knee Bounce Combo",
    category: "juggling",
    difficulty: "advanced",
    description:
      "Juggle using feet AND knees: two foot touches, one knee bounce, repeat. Keeping the pattern is the real challenge.",
    keyPoints: [
      "Thigh flat like a table for knee bounces",
      "Soft foot touches to keep control",
      "Reset with a catch if you lose the pattern",
    ],
    targetLegMotion:
      "Alternating instep lifts and horizontal thigh bounces in rhythm",
    durationSeconds: 90,
    thumbnailEmoji: "🦵",
  },
  {
    name: "Power Strike Form",
    category: "shooting",
    difficulty: "intermediate",
    description:
      "Practice your shooting motion: plant foot beside the ball, strike with your laces, follow through toward the target.",
    keyPoints: [
      "Plant foot points at the target",
      "Strike with your laces, toes down",
      "Follow through and land on your shooting foot",
    ],
    targetLegMotion:
      "Full leg swing with planted support foot, laces contact, and follow-through",
    durationSeconds: 60,
    thumbnailEmoji: "💥",
  },
  {
    name: "Wall Pass Precision",
    category: "passing",
    difficulty: "beginner",
    description:
      "Pass the ball against a wall with the inside of your foot and control the rebound with one touch. Alternate feet every pass.",
    keyPoints: [
      "Ankle locked, foot sideways like a hockey stick",
      "Control the rebound before passing again",
      "Use both feet — lefty passes count double in your heart",
    ],
    targetLegMotion:
      "Inside-foot push pass with locked ankle and one-touch control",
    durationSeconds: 60,
    thumbnailEmoji: "🎯",
  },
];

const existing = await db.select().from(drillsTable);

if (existing.length > 0) {
  console.log(
    `Drills already in the database (${existing.length} found) — nothing to do.`,
  );
} else {
  await db.insert(drillsTable).values(DRILLS);
  console.log(`Seeded ${DRILLS.length} drills! ⚽`);
}

process.exit(0);
