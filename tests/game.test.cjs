const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]).join("\n");
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function setup(options = {}) {
  const elements = new Map();
  const timeouts = [];
  const intervals = new Map();
  const listeners = new Map();
  const saved = new Map([["neverRollOneData", options.saved ?? null]]);
  let now = "2026-09-08T12:00:00Z";
  let authCallback;
  let timerId = 0;
  let signOutCalls = 0;
  const records = new Map();
  const writes = [];
  const document = { activeElement: null, children: [] };
  class Element {
    constructor(id, tagName = "DIV", classes = "") {
      this.id = id;
      this.tagName = tagName;
      this.className = classes;
      this.style = {};
      this.attributes = {};
      this.children = [];
      this.textContent = "";
      this.innerHTML = "";
      this.isConnected = true;
      this.disabled = false;
      this.value = "";
      this.classList = {
        contains: value => this.className.split(/\s+/).includes(value),
        add: (...values) => { this.className = [...new Set([...this.className.split(/\s+/), ...values])].join(" "); },
        remove: (...values) => { this.className = this.className.split(/\s+/).filter(value => !values.includes(value)).join(" "); }
      };
    }
    focus() { document.activeElement = this; }
    contains(element) { return element === this || this.children.includes(element); }
    setAttribute(key, value) { this.attributes[key] = value; }
    addEventListener(type, handler) { listeners.set(`${this.id}:${type}`, handler); }
    querySelectorAll() { return this.children.filter(child => !child.disabled); }
    querySelector(selector) {
      if (this.id === "intensityMessage" && selector === "div") return intensityChild;
      return this.querySelectorAll()[0] || null;
    }
    closest() { return this.classList.contains("hidden") ? this : null; }
    remove() { this.isConnected = false; elements.delete(this.id); }
    insertAdjacentHTML(position, markup) {
      for (const match of markup.matchAll(/<(button|div)[^>]*id="([^"]+)"[^>]*>([^<]*)/g)) {
        const element = new Element(match[2], match[1].toUpperCase());
        element.textContent = match[3];
        elements.set(element.id, element);
      }
    }
  }
  for (const match of html.matchAll(/<([a-z0-9]+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
    elements.set(match[3], new Element(match[3], match[1].toUpperCase(), match[2].match(/class="([^"]*)"/)?.[1] || ""));
  }
  const intensityChild = new Element("intensityChild");
  document.body = new Element("body", "BODY");
  document.body.children = ["mainContent", "leaderboardModal", "displayNameModal"].map(id => elements.get(id));
  document.getElementById = id => elements.get(id) || null;
  document.addEventListener = (type, handler) => listeners.set(type, handler);
  const leaderClose = new Element("leaderClose", "BUTTON");
  const nameCancel = new Element("nameCancel", "BUTTON");
  elements.get("leaderboardModal").children = [leaderClose, elements.get("tabDaily"), elements.get("tabAllTime")];
  elements.get("displayNameModal").children = [elements.get("displayNameInput"), elements.get("saveNameButton"), nameCancel];
  elements.get("actionButton").focus();

  const db = {
    collection(collection) {
      return {
        doc(id) {
          const key = `${collection}/${id}`;
          return {
            key,
            async get() {
              if (options.readError) throw new Error("Read denied");
              return { exists: records.has(key), data: () => records.get(key) };
            },
            async set(value) {
              if (options.nameWriteError) throw new Error("Write denied");
              if (options.nameWriteGate) await options.nameWriteGate.promise;
              records.set(key, value);
            }
          };
        },
        where() { return this; },
        orderBy() { return this; },
        limit() { return this; },
        async get() {
          if (options.readError) throw new Error("Read denied");
          return { docs: [] };
        }
      };
    },
    async runTransaction(callback) {
      if (options.transactionGate) await options.transactionGate.promise;
      if (options.writeError) throw new Error("Write denied");
      return callback({
        get: ref => ref.get(),
        set(ref, value) { records.set(ref.key, value); writes.push({ key: ref.key, value }); }
      });
    }
  };
  const auth = {
    onAuthStateChanged(callback) { authCallback = callback; },
    async signInWithPopup() {
      if (options.popupError) throw options.popupError;
      if (options.popupGate) return options.popupGate.promise;
      return { user: { uid: "test-user" } };
    },
    async signOut() {
      signOutCalls++;
      if (options.signOutError) throw new Error("Sign-out failed");
      if (options.notifySignOut) await authCallback(null);
      if (options.signOutGate) await options.signOutGate.promise;
    }
  };
  const firebase = {
    initializeApp() {},
    auth: Object.assign(() => auth, { GoogleAuthProvider: function () {} }),
    firestore: Object.assign(() => db, { FieldValue: { serverTimestamp: () => "mock-server-timestamp" } })
  };
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return new Date(now).getTime(); }
  }
  const context = vm.createContext({
    document, firebase, Date: Clock, console: { warn() {}, error() {} },
    localStorage: {
      getItem(key) { if (options.storageBlocked) throw new Error("Blocked"); return saved.get(key); },
      setItem(key, value) { if (options.storageBlocked || options.quotaExceeded) throw new Error("Quota"); saved.set(key, value); }
    },
    navigator: options.navigator || {},
    window: { matchMedia: () => ({ matches: true }), addEventListener: (type, fn) => listeners.set(`window:${type}`, fn) },
    setTimeout: fn => { timeouts.push(fn); return ++timerId; },
    setInterval: (fn, delay) => { const id = ++timerId; intervals.set(id, { fn, delay }); return id; },
    clearInterval: id => intervals.delete(id)
  });
  vm.runInContext(script, context);
  const run = code => vm.runInContext(code, context);
  return {
    run, context, elements, document, saved, records, writes, listeners, intervals, leaderClose, nameCancel,
    setNow(value) { now = value; },
    flush() { while (timeouts.length) timeouts.shift()(); },
    async authUser(user) { return authCallback(user); },
    get signOutCalls() { return signOutCalls; },
    roll(value = 2) {
      run(`Math.random = () => ${(value - 0.5) / 6}; rollDice();`);
      this.flush();
    }
  };
}

test("homepage has local CSS, educational identity, disabled ads, and accessible controls", () => {
  assert.doesNotMatch(html, /adsbygoogle|googlesyndication|SHOW_ADS|cdn\.tailwindcss|JACKPOT|% of players/);
  assert.match(html, /rel="canonical" href="https:\/\/neverrollone\.com\/"/);
  assert.match(html, /href="\/assets\/styles\.css"/);
  assert.match(html, /<meta name="google-adsense-account" content="ca-pub-6398871668173615"\s*\/>/);
  assert.match(html, /<h1\b[^>]*>Never Roll a 1<\/h1>/);
  assert.match(html, /<noscript>/);
  assert.match(html, /No wagers/);
  assert.match(html, /contact\.html#leaderboard-report/);
  assert.match(html, /prefers-reduced-motion/);
  assert.match(html, /firestore\.rules/);
  assert.doesNotMatch(html, /allow write:/);
  for (const name of ["wins", "streak", "attempts"]) {
    assert.match(html, new RegExp(`<button[^>]*aria-labelledby="${name}Label ${name}Display"[^>]*id="${name}Block"`));
  }
  assert.equal((html.match(/<div[^>]*role="dialog"/g) || []).length, 2);
});

test("storage failures and corrupt numeric data fall back to a playable in-memory session", () => {
  for (const options of [
    { storageBlocked: true }, { quotaExceeded: true }, { saved: "{" },
    { saved: "null" }, { saved: "[]" }, { saved: '{"totalAttempts":"12"}' },
    { saved: '{"totalAttempts":-1}' }, { saved: '{"allTimeWins":1e99}' }
  ]) {
    const game = setup(options);
    assert.equal(game.run("storageAvailable"), false);
    assert.match(game.elements.get("storageStatus").textContent, /memory only/);
    game.roll(1);
    assert.equal(game.run("totalAttempts"), 1);
    assert.equal(game.run("gameOver"), true);
  }
});

test("loaded numeric data is clamped to coherent totals and legacy streak attempts repaired", () => {
  const game = setup({ saved: JSON.stringify({
    totalAttempts: 3, allTimeWins: 9, dailyAttempts: 20, dailyWins: 10,
    winStreak: 3, streakAttempts: 0, bestStreak: 90, allTimeBestStreak: 50,
    lastPlayedDate: "2026-09-08"
  }) });
  assert.deepEqual(Array.from(game.run("[totalAttempts, allTimeWins, dailyAttempts, dailyWins, winStreak, streakAttempts, bestStreak, allTimeBestStreak]")),
    [3, 3, 3, 3, 3, 3, 10, 3]);
});

test("remaining-win probability, round explanation, observed rate, and attempts are correct", () => {
  const game = setup();
  assert.equal(game.elements.get("currentProb").textContent, "16.15%");
  for (let i = 0; i < 9; i++) game.roll();
  assert.equal(game.elements.get("currentProb").textContent, "83.33%");
  assert.equal(game.run("totalAttempts"), 0);
  game.roll();
  assert.equal(game.elements.get("currentProb").textContent, "100.00%");
  assert.match(game.elements.get("roundExplanation").textContent, /round is won/);
  assert.deepEqual(Array.from(game.run("[totalAttempts, dailyAttempts, streakAttempts, winStreak, allTimeWins]")), [1, 1, 1, 1, 1]);
  game.run("reset()");
  for (let i = 0; i < 10; i++) game.roll();
  assert.deepEqual(Array.from(game.run("[totalAttempts, streakAttempts, winStreak, winningScore.attempts]")), [2, 2, 2, 2]);
  game.run("reset()");
  game.roll(1);
  assert.equal(game.elements.get("currentProb").textContent, "0.00%");
  assert.match(game.elements.get("roundExplanation").textContent, /round ended on roll 1/);
  assert.equal(game.elements.get("userSuccessRate").textContent, "66.7%");
  assert.deepEqual(Array.from(game.run("[totalAttempts, streakAttempts, winStreak]")), [3, 1, 0]);
});

test("UTC rollover resets idle daily stats and current streak but preserves all-time stats", () => {
  const game = setup();
  game.run("totalAttempts = 8; dailyAttempts = 8; allTimeWins = 4; dailyWins = 4; winStreak = 2; streakAttempts = 3; todayBestStreak = 2; allTimeBestStreak = 3;");
  game.setNow("2026-09-09T00:00:00Z");
  [...game.intervals.values()].find(timer => timer.delay === 1000).fn();
  assert.deepEqual(Array.from(game.run("[dailyWins, dailyAttempts, todayBestStreak, allTimeWins, totalAttempts, winStreak, streakAttempts, allTimeBestStreak]")),
    [0, 0, 0, 4, 8, 0, 0, 3]);
  assert.equal(JSON.parse(game.saved.get("neverRollOneData")).lastPlayedDate, "2026-09-09");
  assert.equal(game.run("getTodayString()"), "2026-09-09");
});

test("a round ending across UTC midnight belongs to its completion date", () => {
  const game = setup();
  game.run("winStreak = 3; streakAttempts = 3; allTimeWins = 3; totalAttempts = 3; allTimeBestStreak = 3;");
  for (let i = 0; i < 9; i++) game.roll();
  game.setNow("2026-09-09T00:00:00Z");
  game.roll();
  assert.equal(game.run("winningScore.date"), "2026-09-09");
  assert.equal(game.run("dailyWins"), 1);
  assert.equal(game.run("dailyAttempts"), 1);
  assert.equal(game.run("winningScore.streak"), 1);
  assert.equal(game.run("winningScore.attempts"), 1);
  assert.equal(game.run("allTimeWins"), 4);
  assert.equal(game.run("totalAttempts"), 4);
  assert.equal(game.run("allTimeBestStreak"), 3);
});

test("leaderboard fetch failures are visible, not false empty leaderboards", async () => {
  const game = setup({ readError: true });
  await game.run('loadLeaderboardData("daily")');
  assert.match(game.elements.get("leaderboardContent").innerHTML, /could not be loaded/);
  assert.doesNotMatch(game.elements.get("leaderboardContent").innerHTML, /No scores yet/);
});

test("late leaderboard responses cannot overwrite a newer tab", async () => {
  const game = setup();
  const daily = deferred();
  game.context.pendingDaily = daily.promise;
  game.run('fetchDailyLeaderboard = () => pendingDaily; fetchAllTimeLeaderboard = async () => [{displayName: "Alltime", streak: 2, attempts: 2}];');
  const old = game.run('loadLeaderboardData("daily")');
  game.run('currentLeaderboardTab = "alltime"');
  await game.run('loadLeaderboardData("alltime")');
  daily.resolve([{ displayName: "StaleDaily", streak: 1, attempts: 1 }]);
  await old;
  assert.match(game.elements.get("leaderboardContent").innerHTML, /Alltime/);
  assert.doesNotMatch(game.elements.get("leaderboardContent").innerHTML, /StaleDaily/);
});

test("remote numeric values and labels cannot inject HTML or crash rendering", () => {
  const game = setup();
  game.run(`renderLeaderboardEntries([
    { displayName: '<img src=x>', streak: '<img onerror=x>', attempts: {bad: true}, timestamp: {toDate: "bad"} },
    { displayName: '"\\'&', streak: 1, attempts: 2, timestamp: {toDate() { throw Error("bad"); }} },
    null
  ])`);
  const content = game.elements.get("leaderboardContent").innerHTML;
  assert.doesNotMatch(content, /<img|onerror/);
  assert.match(content, /&lt;img src=x&gt;/);
  assert.match(content, /&quot;&#39;&amp;/);
  assert.match(content, /Unavailable/);
  game.run(`currentUser = {uid: "test-user"}; updateLeaderboardAuthUI({streak: "<img>", attempts: []}, "daily")`);
  assert.doesNotMatch(game.elements.get("leaderboardAuthSection").innerHTML, /<img>/);
});

test("automatic submission captures score, date, and identity before asynchronous work", async () => {
  const gate = deferred();
  const game = setup({ transactionGate: gate });
  game.run('currentUser = {uid: "test-user"}; userDisplayName = "Tester"; winningScore = {streak: 2, attempts: 3, date: "2026-09-08", roundId: 0};');
  const save = game.run("autoSaveScore()");
  game.run("reset(); winStreak = 99; streakAttempts = 100;");
  game.setNow("2026-09-09T00:00:00Z");
  gate.resolve();
  assert.equal(await save, true);
  assert.equal(game.records.get("dailyScores/test-user_2026-09-08").streak, 2);
  assert.equal(game.records.get("allTimeScores/test-user").attempts, 3);
  assert.equal(game.elements.get("saveToLeaderboardBtn"), undefined);
});

test("manual save retains the winning snapshot while waiting for sign-in", async () => {
  const popup = deferred();
  const game = setup({ popupGate: popup });
  game.records.set("users/test-user", { displayName: "Tester" });
  game.run('winningScore = {streak: 1, attempts: 1, date: "2026-09-08", roundId: 0};');
  const save = game.run("saveScoreToLeaderboard()");
  game.run("reset(); winStreak = 12; streakAttempts = 15;");
  popup.resolve({ user: { uid: "test-user" } });
  await save;
  assert.equal(game.records.get("allTimeScores/test-user").streak, 1);
  assert.equal(game.records.get("allTimeScores/test-user").attempts, 1);
});

test("transactional score comparisons never replace a better score with a worse one", async () => {
  const game = setup();
  game.run('currentUser = {uid: "test-user"}; userDisplayName = "Tester";');
  await game.run('submitScore({streak: 3, attempts: 4, date: "2026-09-08"})');
  await game.run('submitScore({streak: 2, attempts: 2, date: "2026-09-08"})');
  await game.run('submitScore({streak: 3, attempts: 3, date: "2026-09-08"})');
  assert.equal(game.records.get("allTimeScores/test-user").streak, 3);
  assert.equal(game.records.get("allTimeScores/test-user").attempts, 3);
});

test("automatic submission failure is visible and stale sessions cannot submit", async () => {
  const game = setup({ writeError: true });
  game.run('currentUser = {uid: "test-user"}; userDisplayName = "Tester"; winningScore = {streak: 1, attempts: 1, date: "2026-09-08"};');
  assert.equal(await game.run("autoSaveScore()"), false);
  assert.match(game.elements.get("appStatus").textContent, /submission failed/);
  const gate = deferred();
  const other = setup({ transactionGate: gate });
  other.run('currentUser = {uid: "test-user"}; userDisplayName = "Tester"; winningScore = {streak: 1, attempts: 1, date: "2026-09-08"};');
  const save = other.run("autoSaveScore()");
  await Promise.resolve();
  await other.run("signOutUser()");
  gate.resolve();
  assert.equal(await save, false);
  assert.equal(other.writes.length, 0);
});

test("clipboard rejection and cancelled native sharing are handled visibly", async () => {
  const game = setup({ navigator: { clipboard: { async writeText() { throw new Error("Denied"); } } } });
  await game.run('shareScore(document.getElementById("actionButton"))');
  assert.match(game.elements.get("appStatus").textContent, /Sharing failed/);
  const cancelled = setup({ navigator: { async share() { throw Object.assign(new Error("Cancelled"), { name: "AbortError" }); } } });
  await cancelled.run('shareScore(document.getElementById("actionButton"))');
  assert.equal(cancelled.elements.get("appStatus").textContent, "Sharing cancelled.");
  const copied = setup({ navigator: { clipboard: { async writeText() {} } } });
  await copied.run('shareScore(document.getElementById("actionButton"))');
  assert.equal(copied.elements.get("actionButton").textContent, "✅ Copied!");
});

test("nested dialogs trap Tab, Escape cancels name setup, and focus returns correctly", async () => {
  const game = setup();
  game.run("openLeaderboard()");
  assert.equal(game.document.activeElement, game.leaderClose);
  game.run('currentUser = {uid: "test-user"};');
  const name = game.run("openDisplayNameModal()");
  assert.equal(game.document.activeElement.id, "displayNameInput");
  assert.equal(game.elements.get("leaderboardModal").inert, true);
  game.nameCancel.focus();
  let prevented = false;
  game.listeners.get("keydown")({ key: "Tab", shiftKey: false, preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(game.document.activeElement.id, "displayNameInput");
  game.listeners.get("keydown")({ key: "Tab", shiftKey: true, preventDefault() {} });
  assert.equal(game.document.activeElement, game.nameCancel);
  game.listeners.get("keydown")({ key: "Escape", preventDefault() {} });
  assert.equal(await name, false);
  await Promise.resolve();
  assert.equal(game.run("currentUser"), null);
  assert.equal(game.run("nameRequest"), null);
  assert.equal(game.signOutCalls, 1);
  assert.equal(game.document.activeElement, game.leaderClose);
  assert.equal(game.elements.get("leaderboardModal").inert, false);
  game.run("closeLeaderboard()");
  assert.equal(game.document.activeElement.id, "actionButton");
  assert.equal(game.document.body.style.overflow, "");
});

test("popup cancellation and failed profile lookup clean up sign-in and show errors", async () => {
  for (const options of [{ popupError: { code: "auth/popup-closed-by-user" } }, { readError: true }]) {
    const game = setup(options);
    assert.equal(await game.run("signInWithGoogle()"), null);
    assert.equal(game.run("currentUser"), null);
    assert.equal(game.run("signingIn"), false);
    assert.equal(game.run("nameRequest"), null);
    assert.equal(game.signOutCalls, 1);
    assert.match(game.elements.get("appStatus").textContent, /cancelled|failed/);
  }
});

test("cancelling name setup during a pending write never resumes score submission", async () => {
  const gate = deferred();
  const game = setup({ nameWriteGate: gate });
  game.run('currentUser = {uid: "test-user"};');
  const name = game.run("openDisplayNameModal()");
  game.elements.get("displayNameInput").value = "Tester";
  const save = game.run("saveDisplayName()");
  await game.run("cancelDisplayName()");
  gate.resolve();
  await save;
  assert.equal(await name, false);
  assert.equal(game.run("userDisplayName"), null);
  assert.equal(game.run("currentUser"), null);
  assert.equal(game.writes.length, 0);
});

test("a late failed leaderboard request cannot replace the successful current tab", async () => {
  const game = setup();
  const daily = deferred();
  game.context.pendingDaily = daily.promise;
  game.run('fetchDailyLeaderboard = () => pendingDaily; fetchAllTimeLeaderboard = async () => [{displayName: "Current", streak: 2, attempts: 2}];');
  const old = game.run('loadLeaderboardData("daily")');
  game.run('currentLeaderboardTab = "alltime"');
  await game.run('loadLeaderboardData("alltime")');
  daily.reject(new Error("Old request failed"));
  await old;
  assert.match(game.elements.get("leaderboardContent").innerHTML, /Current/);
  assert.doesNotMatch(game.elements.get("leaderboardContent").innerHTML, /could not be loaded/);
});

test("winning-flow autosave completion never inserts status controls into a later round", async () => {
  const gate = deferred();
  const game = setup({ transactionGate: gate });
  game.run('currentUser = {uid: "test-user"}; userDisplayName = "Tester";');
  for (let i = 0; i < 10; i++) game.roll();
  assert.ok(game.elements.get("saveToLeaderboardBtn"));
  game.run("reset()");
  gate.resolve();
  await game.run("scoreQueue");
  await Promise.resolve();
  assert.equal(game.elements.get("saveToLeaderboardBtn"), undefined);
  assert.equal(game.elements.get("autoSavedMsg"), undefined);
  assert.equal(game.records.get("allTimeScores/test-user").streak, 1);
  assert.equal(game.records.get("allTimeScores/test-user").attempts, 1);
});

test("failed display-name writes show an error and remain cancellable", async () => {
  const game = setup({ nameWriteError: true });
  game.run('currentUser = {uid: "test-user"};');
  const name = game.run("openDisplayNameModal()");
  game.elements.get("displayNameInput").value = "Tester";
  await game.run("saveDisplayName()");
  assert.match(game.elements.get("displayNameError").textContent, /Failed to save/);
  assert.equal(game.elements.get("saveNameButton").disabled, false);
  await game.run("cancelDisplayName()");
  assert.equal(await name, false);
  assert.equal(game.run("nameRequest"), null);
});

test("persistent stats restore accurately after a completed win", () => {
  const game = setup();
  for (let i = 0; i < 10; i++) game.roll();
  const restored = setup({ saved: game.saved.get("neverRollOneData") });
  assert.deepEqual(Array.from(restored.run("[totalAttempts, allTimeWins, winStreak, streakAttempts, dailyAttempts, dailyWins]")),
    [1, 1, 1, 1, 1, 1]);
});

test("sign-out callback before promise completion does not strand leaderboard loading", async () => {
  const signOutGate = deferred();
  const scores = deferred();
  const game = setup({ notifySignOut: true, signOutGate });
  game.context.pendingScores = scores.promise;
  game.run('currentUser = {uid: "test-user"}; userDisplayName = "Tester"; fetchDailyLeaderboard = () => pendingScores; openLeaderboard();');
  const signOut = game.run("signOutUser()");
  assert.equal(game.run("currentUser"), null);
  const revisionAfterCallback = game.run("authRevision");
  assert.match(game.elements.get("leaderboardContent").innerHTML, /Loading scores/);
  signOutGate.resolve();
  await signOut;
  assert.equal(game.run("authRevision"), revisionAfterCallback);
  scores.resolve([{ displayName: "Public score", streak: 1, attempts: 1 }]);
  await scores.promise;
  await Promise.resolve();
  await Promise.resolve();
  assert.match(game.elements.get("leaderboardContent").innerHTML, /Public score/);
  assert.doesNotMatch(game.elements.get("leaderboardContent").innerHTML, /Loading scores/);
});

test("name cancellation with an early auth callback refreshes pending leaderboard data", async () => {
  const signOutGate = deferred();
  const scores = deferred();
  const game = setup({ notifySignOut: true, signOutGate });
  game.context.pendingScores = scores.promise;
  game.run('currentUser = {uid: "test-user"}; fetchDailyLeaderboard = () => pendingScores; openLeaderboard();');
  const name = game.run("openDisplayNameModal()");
  const cancel = game.run("cancelDisplayName()");
  assert.equal(await name, false);
  signOutGate.resolve();
  await cancel;
  scores.resolve([{ displayName: "After cancel", streak: 2, attempts: 2 }]);
  await scores.promise;
  await Promise.resolve();
  await Promise.resolve();
  assert.match(game.elements.get("leaderboardContent").innerHTML, /After cancel/);
  assert.doesNotMatch(game.elements.get("leaderboardContent").innerHTML, /Loading scores/);
});

test("failed sign-in cleanup refreshes leaderboard even when sign-out cannot notify", async () => {
  const scores = deferred();
  const game = setup({ signOutError: true });
  game.context.pendingScores = scores.promise;
  game.run('currentUser = {uid: "test-user"}; fetchDailyLeaderboard = () => pendingScores; openLeaderboard();');
  await game.run("clearFailedSignIn()");
  scores.resolve([{ displayName: "After cleanup", streak: 1, attempts: 1 }]);
  await scores.promise;
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(game.run("currentUser"), null);
  assert.match(game.elements.get("leaderboardContent").innerHTML, /After cleanup/);
  assert.doesNotMatch(game.elements.get("leaderboardContent").innerHTML, /Loading scores/);
});
