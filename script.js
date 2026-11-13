// Native UTF-8 Emoji Symbol Decks
const DECKS = {
  classic: ["🍒", "🍋", "🔔", "⭐", "💎", "7️⃣"],
  cyber: ["⚡", "👾", "🤖", "🔋", "🛸", "💎"],
  fruits: ["🍒", "🍋", "🍉", "🍇", "🍓", "🍍"]
};

let emojis = DECKS.classic;

// Game Constants & State Variables
const INITIAL_SCORE = 100;
const SPIN_COST = 10;
const JACKPOT_PAYOUT = 100;
const SHUFFLE_INTERVAL_MS = 75;
const SPIN_DURATION_MS = 1500;

let score = INITIAL_SCORE;
let totalSpins = 0;
let totalJackpots = 0;
let isSpinning = false;
let spinIntervalId = null;
let spinTimeoutId = null;
let soundEnabled = true;
let audioCtx = null;

// DOM Node Selectors
const reel1 = document.getElementById("reel-1");
const reel2 = document.getElementById("reel-2");
const reel3 = document.getElementById("reel-3");
const reelBoxes = [reel1, reel2, reel3];
const reelFrames = document.querySelectorAll(".reel-frame");

const scoreDisplay = document.getElementById("score-display");
const jackpotCountEl = document.getElementById("jackpot-count");
const spinCountEl = document.getElementById("spin-count");
const statusBanner = document.getElementById("status-banner");
const arcadeCabinet = document.getElementById("arcade-cabinet");

const spinBtn = document.getElementById("spin-btn");
const resetBtn = document.getElementById("reset-btn");
const soundToggleBtn = document.getElementById("sound-toggle");
const themeToggles = document.getElementById("theme-toggles");
const deckToggles = document.getElementById("deck-toggles");

/**
 * Pure Vanilla Web Audio API Synthesizer (Zero External Assets)
 */
function playTone(freq, type, duration, delay = 0) {
  if (!soundEnabled) return;
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const startTime = audioCtx.currentTime + delay;

    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(0.08, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration);
  } catch (e) {
    // Ignore audio context restrictions if blocked by browser policy
  }
}

function playJackpotFanfare() {
  playTone(523.25, "triangle", 0.14, 0);    // C5
  playTone(659.25, "triangle", 0.14, 0.12); // E5
  playTone(783.99, "triangle", 0.14, 0.24); // G5
  playTone(1046.5, "square", 0.35, 0.36);   // C6
}

/**
 * Pick a Random UTF-8 Emoji from the Active Deck
 */
function getRandomEmoji() {
  return emojis[Math.floor(Math.random() * emojis.length)];
}

/**
 * Step 1-4: Execute Spin Lifecycle with Concurrency Lock, 75ms Interval, and 1500ms Timeout
 */
function spin() {
  // Guard condition: prevent overlapping spins or insufficient balance
  if (isSpinning || score < SPIN_COST) {
    return;
  }

  // Step 1: Concurrency Lock (Immediately disable button to prevent race conditions)
  isSpinning = true;
  spinBtn.disabled = true;

  // Deduct 10 points and update scoreboard immediately
  score -= SPIN_COST;
  totalSpins++;
  updateScoreboard();

  // Clear previous highlight states
  arcadeCabinet.classList.remove("jackpot-win");
  statusBanner.classList.remove("win-banner", "gameover-banner");
  reelFrames.forEach((frame) => frame.classList.remove("match-highlight"));
  statusBanner.textContent = "SPINNING REELS... GOOD LUCK!";

  // Step 2: Apply .rolling CSS blur and start 75ms shuffle interval
  reelBoxes.forEach((reel) => reel.classList.add("rolling"));

  spinIntervalId = setInterval(() => {
    reel1.textContent = getRandomEmoji();
    reel2.textContent = getRandomEmoji();
    reel3.textContent = getRandomEmoji();
    playTone(220 + Math.random() * 180, "sine", 0.04);
  }, SHUFFLE_INTERVAL_MS);

  // Step 3: Halt & Reveal after 1500ms via setTimeout
  spinTimeoutId = setTimeout(() => {
    clearInterval(spinIntervalId);
    spinIntervalId = null;

    // Remove rolling blur filter
    reelBoxes.forEach((reel) => reel.classList.remove("rolling"));

    // Lock in final 3 randomized emojis
    const r1 = getRandomEmoji();
    const r2 = getRandomEmoji();
    const r3 = getRandomEmoji();

    reel1.textContent = r1;
    reel2.textContent = r2;
    reel3.textContent = r3;

    // Step 4: Audit Jackpot Condition
    evaluateOutcome(r1, r2, r3);
  }, SPIN_DURATION_MS);
}

/**
 * Step 4: Evaluate 3-Way Match Jackpot & Manage Game Over Lock
 */
function evaluateOutcome(r1, r2, r3) {
  if (r1 === r2 && r2 === r3) {
    // 3-Way Jackpot Match (+100 Points)
    score += JACKPOT_PAYOUT;
    totalJackpots++;
    updateScoreboard();

    arcadeCabinet.classList.add("jackpot-win");
    statusBanner.classList.add("win-banner");
    reelFrames.forEach((frame) => frame.classList.add("match-highlight"));
    statusBanner.textContent = `🎉 JACKPOT! ${r1} ${r2} ${r3} MATCHED — +100 POINTS!`;
    playJackpotFanfare();
  } else if (r1 === r2 || r2 === r3 || r1 === r3) {
    // Near-Miss Feedback (Visual polish; strict rubric only pays +100 on 3-way match)
    statusBanner.textContent = `SO CLOSE! 2 MATCHED (${r1} ${r2} ${r3}) — SPIN AGAIN!`;
    playTone(300, "sawtooth", 0.12);
  } else {
    statusBanner.textContent = `NO MATCH (${r1} ${r2} ${r3}) — TRY YOUR LUCK AGAIN!`;
    playTone(160, "sine", 0.12);
  }

  isSpinning = false;

  // Check if player has enough points for another spin (Minimum 10 points)
  if (score >= SPIN_COST) {
    spinBtn.disabled = false;
  } else {
    handleGameOver();
  }
}

/**
 * Lock Spin Button When Score Falls Below 10
 */
function handleGameOver() {
  spinBtn.disabled = true;
  statusBanner.classList.add("gameover-banner");
  statusBanner.textContent = "GAME OVER — INSUFFICIENT POINTS! PRESS 'INSERT COIN' TO RELOAD.";
  playTone(130, "sawtooth", 0.35);
}

/**
 * Synchronize Scoreboard DOM Nodes with State
 */
function updateScoreboard() {
  scoreDisplay.textContent = score;
  jackpotCountEl.textContent = totalJackpots;
  spinCountEl.textContent = totalSpins;
}

/**
 * Reset / Insert Coin Handler (Clears active timers safely and restores 100 points)
 */
function resetGame() {
  clearInterval(spinIntervalId);
  clearTimeout(spinTimeoutId);
  spinIntervalId = null;
  spinTimeoutId = null;
  isSpinning = false;

  score = INITIAL_SCORE;
  totalSpins = 0;
  totalJackpots = 0;
  updateScoreboard();

  reelBoxes.forEach((reel) => reel.classList.remove("rolling"));
  reelFrames.forEach((frame) => frame.classList.remove("match-highlight"));
  arcadeCabinet.classList.remove("jackpot-win");
  statusBanner.classList.remove("win-banner", "gameover-banner");

  reel1.textContent = emojis[0];
  reel2.textContent = emojis[4];
  reel3.textContent = emojis[5];

  statusBanner.textContent = "CREDITS RESTORED TO 100 PTS — READY TO SPIN!";
  spinBtn.disabled = false;
  playTone(440, "triangle", 0.12);
}

// Event Listeners
spinBtn.addEventListener("click", spin);
resetBtn.addEventListener("click", resetGame);

// Allow Spacebar to trigger spin when not focused on another button
document.addEventListener("keydown", (event) => {
  if (event.code === "Space" && !isSpinning && score >= SPIN_COST) {
    if (document.activeElement.tagName !== "BUTTON") {
      event.preventDefault();
      spin();
    }
  }
});

// Cabinet Theme Switcher
themeToggles.addEventListener("click", (event) => {
  if (event.target.tagName !== "BUTTON") return;
  document.querySelectorAll("#theme-toggles button").forEach((btn) => {
    btn.classList.remove("active");
  });
  event.target.classList.add("active");
  document.body.setAttribute("data-theme", event.target.dataset.theme);
});

// Emoji Deck Switcher
deckToggles.addEventListener("click", (event) => {
  if (event.target.tagName !== "BUTTON") return;
  document.querySelectorAll("#deck-toggles button").forEach((btn) => {
    btn.classList.remove("active");
  });
  event.target.classList.add("active");
  emojis = DECKS[event.target.dataset.deck];

  if (!isSpinning) {
    reel1.textContent = emojis[0];
    reel2.textContent = emojis[1];
    reel3.textContent = emojis[2];
  }
});

// Sound Toggle Switcher
soundToggleBtn.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  soundToggleBtn.setAttribute("aria-pressed", String(soundEnabled));
  soundToggleBtn.textContent = soundEnabled ? "SFX: ON 🔊" : "SFX: OFF 🔇";
});

// Initialize Scoreboard on Load
updateScoreboard();