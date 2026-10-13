export const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
export const colors = ["#D6EDC9", "#B07156", "#7F7057", "#4E6E58"];
const answers = ["Bratislava", "Vienna", "Prague", "Budapest"].map(
  (answer, i) => ({ answer, right: i === 0, color: colors[i] }),
);
export const questions: any[] = [
  {
    type: "ABCD",
    question: "What is the capital of Slovakia?",
    time: "60",
    image: null,
    answers,
  },
  {
    type: "RANGE",
    question: "How many countries are in the European Union?",
    time: "60",
    image: null,
    answers: { min: 1, max: 50, min_correct: 27, max_correct: 27 },
  },
  {
    type: "VOTING",
    question: "Where should our next school trip take us?",
    time: "60",
    image: null,
    answers: clone(answers),
  },
  {
    type: "TEXT",
    question: "Name the river that flows through Bratislava.",
    time: "60",
    image: null,
    answers: [{ answer: "Danube", case_sensitive: false }],
  },
  {
    type: "ORDER",
    question: "Order these planets from closest to the Sun.",
    time: "60",
    image: null,
    answers: ["Mercury", "Venus", "Earth", "Mars"].map((answer, id) => ({
      answer,
      id,
    })),
  },
  {
    type: "CHECK",
    question: "Which of these countries border Slovakia?",
    time: "60",
    image: null,
    answers: answers.map((a, i) => ({
      ...a,
      answer: ["Austria", "Poland", "Italy", "Hungary"][i],
      right: i !== 2,
    })),
  },
  {
    type: "SLIDE",
    question: "Ready for the next adventure?",
    time: "120",
    image: null,
    answers: JSON.stringify({
      stage: { className: "Stage", attrs: { width: 960, height: 540 } },
      layer: { className: "Layer", attrs: {} },
      background: {
        image: { className: "Image", attrs: {} },
        overlay: {
          className: "Rect",
          attrs: { fill: "#d6edc9", width: 960, height: 540 },
        },
      },
      shapes: [
        {
          className: "Text",
          group: null,
          attrs: {
            x: 80,
            y: 150,
            width: 800,
            text: "Explore. Think. Discover.",
            fontFamily: "Arial",
            fontSize: 52,
            fill: "#243d2c",
          },
        },
        {
          className: "Text",
          group: null,
          attrs: {
            x: 80,
            y: 240,
            width: 790,
            text: "Every question is a chance to learn something new.",
            fontFamily: "Arial",
            fontSize: 26,
            fill: "#4e6e58",
          },
        },
      ],
    }),
  },
];
export const user = {
  id: "preview-teacher",
  username: "Alex Novak",
  email: "alex@example.test",
  verified: true,
  created_at: "2025-09-01T10:00:00Z",
  require_password: true,
};
export const quiz: any = {
  id: "geography",
  quiz_id: "geography",
  title: "A journey through Europe",
  description: "Discover cities, rivers and the places that connect us.",
  public: true,
  user: "Alex Novak",
  user_id: user.id,
  created_at: "2026-10-01T09:00:00Z",
  updated_at: "2026-10-10T12:00:00Z",
  questions,
  cover_image: "europe",
  background_color: null,
  background_image: null,
  likes: 42,
  dislikes: 2,
  plays: 168,
  views: 524,
  game_id: "preview-game",
  game_pin: "12345678",
  started: false,
  imported_from_kahoot: false,
};
export const quizzes = [
  "A journey through Europe",
  "The living world",
  "Numbers all around us",
  "A brief history of everything",
  "Space explorers",
  "Words and wonders",
].map((title, i) => ({
  ...clone(quiz),
  id: i ? "quiz-" + i : "geography",
  title,
  cover_image:
    i === 5 ? null : ["europe", "nature", "math", "history", "space"][i % 5],
}));
export const players = Array.from({ length: 60 }, (_, i) => ({
  username:
    ["Sofia", "Oliver", "Emma", "Leo", "Nina", "Adam", "Mia", "Lukas"][i % 8] +
    (i > 7 ? " " + (i + 1) : ""),
  sid: "player-" + i,
  custom_field: "Class 7A",
}));
export const questionResults = players
  .slice(0, 8)
  .map((p, i) => ({
    ...p,
    answer: i % 3 === 0 ? "Vienna" : "Bratislava",
    right: i % 3 !== 0,
    time_taken: 2300 + i * 870,
    score: 980 - i * 71,
  }));
export const scores = Object.fromEntries(
  questionResults.map((p) => [p.username, String(p.score * 5)]),
);
export const result = {
  id: "class-7a",
  title: quiz.title,
  timestamp: "2026-10-12T09:15:00Z",
  note: "Class 7A · Geography",
  player_scores: scores,
  custom_field_data: Object.fromEntries(
    players.slice(0, 8).map((p) => [p.username, p.custom_field]),
  ),
  questions: clone(questions),
  answers: questions.map(() => clone(questionResults)),
};
export const files = ["europe", "nature", "space"].map((id, i) => ({
  id,
  filename: id + ".svg",
  alt_text: ["Mountains and rivers", "Our natural world", "Beyond the stars"][
    i
  ],
  mime_type: "image/svg+xml",
  size: 4200,
  uploaded_at: "2026-10-01T10:00:00Z",
  imported: false,
  quizzes: [],
  quiztivities: [],
  server: "local",
}));
export const controller = {
  id: "controller-1",
  name: "Classroom controller",
  player_name: "Sofia",
  os_version: "1.2.0",
  wanted_os_version: "1.2.0",
  first_seen: "2026-10-01T10:00:00Z",
  last_seen: "2026-10-12T10:00:00Z",
  created_at: "2026-10-01T10:00:00Z",
};
export const activity = {
  id: "activity-1",
  title: "Discover Europe",
  pages: [
    {
      type: "MARKDOWN",
      title: "Welcome",
      data: {
        markdown:
          "# Discover Europe\n\nA small continent full of big ideas.\n\n- Explore its landscapes\n- Match cities and countries\n- Test your knowledge",
      },
    },
    {
      type: "ABCD",
      title: "A quick question",
      data: {
        question: questions[0].question,
        answers: answers.map((a) => ({ answer: a.answer, correct: a.right })),
      },
    },
    {
      type: "MEMORY",
      title: "Find the pairs",
      data: {
        cards: [
          [
            { id: "a1", text: "Slovakia" },
            { id: "a2", text: "Bratislava" },
          ],
          [
            { id: "b1", text: "Austria" },
            { id: "b2", text: "Vienna" },
          ],
          [
            { id: "c1", text: "Czechia" },
            { id: "c2", text: "Prague" },
          ],
        ],
      },
    },
  ],
};
export const loginSession = {
  id: "preview-session",
  session_id: "preview-session",
  step_1: ["PASSWORD", "PASSKEY"],
  step_2: ["TOTP"],
  email: user.email,
};
