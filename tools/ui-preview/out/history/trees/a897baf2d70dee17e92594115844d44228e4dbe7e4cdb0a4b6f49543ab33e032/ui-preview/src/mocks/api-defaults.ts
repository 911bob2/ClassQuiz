import { quiz, quizzes, user, files, players, loginSession } from "./data";
import type { FetchRoutes } from "../shims/fetch-mock";
export const artwork = (id = "europe") =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"><rect width="960" height="540" fill="${id === "space" ? "#202e48" : "#c6dfba"}"/><circle cx="740" cy="120" r="65" fill="#e9bd72"/><path d="M0 460 270 90 520 460Z" fill="#4e6e58"/><path d="m155 248 115-158 114 158-65-30-55 35-49-39Z" fill="#f7f5e9"/><path d="M350 540 650 180 960 540Z" fill="#7a947b"/><path d="M0 440Q210 340 460 480T960 420V540H0Z" fill="#92b6b6"/><text x="48" y="490" font-size="32" font-family="sans-serif" fill="#203c36">${id === "space" ? "Beyond the stars" : "A world to discover"}</text></svg>`;
export const apiDefaults: FetchRoutes = {
  "GET /api/v1/users/me": user,
  "GET /api/v1/quiz/get/*": quiz,
  "GET /api/v1/quiz/list*": quizzes,
  "GET /api/v1/quiz/play/check_captcha/*": {
    game_mode: "kahoot",
    enabled: false,
    captcha_enabled: false,
    custom_field: null,
  },
  "POST /api/v1/search/*": { hits: quizzes.map((q) => ({ _formatted: q })) },
  "GET https://api.github.com/repos/mawoka-myblock/ClassQuizController/releases":
    [{ tag_name: "v1.2.0" }],
  "GET /api/v1/storage/info/*": {
    text: "",
    headers: {
      "Content-Type": "image/svg+xml",
      "x-thumbhash": "1QcSHQRnh493V4dIh4eXh1h4kJUI",
      "X-Alt-Text": "TW91bnRhaW5zIGFuZCByaXZlcnM=",
    },
  },
  "GET /api/v1/storage/download/*": ({ path }: any) => ({
    text: artwork(path.split("/").pop()),
    headers: { "Content-Type": "image/svg+xml" },
  }),
  "GET /api/v1/storage/list*": files,
  "POST /api/v1/editor/start*": { token: "preview-edit" },
  "POST /api/v1/editor/finish*": { ok: true },
  "GET /api/v1/users/api_keys": ["preview-key-not-a-real-secret"],
  "POST /api/v1/users/api_keys": { ok: true },
  "DELETE /api/v1/users/api_keys*": { ok: true },
  "GET /api/v1/users/sessions/list": [],
  "GET /api/v1/users/session": { id: "preview-session" },
  "GET /api/v1/users/webauthn/list": [],
  "GET /api/v1/users/2fa/totp": { activated: false },
  "GET /api/v1/quiz/rating/*": { likes: 42, dislikes: 2, rating: null },
  "GET /api/v1/live/players*": players.slice(0, 8),
  "POST /api/v1/login/start": loginSession,
  "POST /api/v1/login/password": { step: 2, done: false },
  "POST /api/v1/login/step/1*": { status: 202, json: { step: 2 } },
  "POST /api/v1/login/step/2*": { status: 200, json: { done: true } },
  "POST /api/v1/quiz/start/*": {
    game_id: "preview-game",
    game_pin: "12345678",
    cqc_code: "1234",
  },
  "GET /api/v1/box-controller/web/controller*": { first_seen: null },
  "POST /api/v1/box-controller/web/setup": { id: "controller-1", code: "1234" },
  "POST /api/v1/box-controller/web/modify": { ok: true },
  "PUT /api/v1/storage/meta/*": { ok: true },
  "DELETE /api/v1/storage/meta/*": { ok: true },
  "GET /api/v1/quiztivity/shares/*": [],
  "PUT /api/v1/quiztivity/*": { ok: true },
  "POST /api/v1/quiztivity/create": { id: "activity-1" },
  "POST /api/v1/avatar/save*": { ok: true },
  "POST /api/v1/users/forgot-password": { ok: true },
  "POST /api/v1/users/reset-password": { ok: true },
  "POST /api/v1/users/create": { ok: true },
};
