# EmojiSlots — 3-Reel Arcade Slot Machine

A retro-futuristic 3-reel arcade slot machine built strictly with vanilla **HTML5**, **CSS3**, and **JavaScript**. Demonstrates asynchronous JavaScript timer orchestration (`setInterval` + `setTimeout`), concurrency button locking to prevent race conditions, randomized array indexing, and browser-native Web Audio API sound synthesis.

## Live Demo & Repository

* **Live Deployment (Vercel):** [https://slot-gold.vercel.app/](#)


---

## Core Engineering Architecture

### 1. Asynchronous Timer Collaboration (`setInterval` vs. `setTimeout`)
A realistic slot machine requires visual suspense rather than instant calculation. EmojiSlots coordinates two asynchronous timers on every spin:
* **`setInterval` ($75\text{ ms}$ Animation Tick):** Fires every $75\text{ ms}$ to cycle randomized native UTF-8 emojis across `#reel-1`, `#reel-2`, and `#reel-3` while applying the `.rolling` CSS class (`filter: blur(2px); transform: scale(0.97)`).
* **`setTimeout` ($1500\text{ ms}$ Game Conductor):** Fires once after $1500\text{ ms}$ to execute `clearInterval()`, remove the `.rolling` motion blur, lock in the final three outcomes (`r1`, `r2`, `r3`), and audit the jackpot condition.

### 2. Concurrency Locking (Race-Condition Prevention)
Rapidly clicking the Spin button multiple times in an unguarded app spawns overlapping intervals that drain player points repeatedly and break the reel animations.
* **The Fix:** The very first statements inside `spin()` set `isSpinning = true` and `spinBtn.disabled = true`. The button remains locked throughout the $1500\text{ ms}$ animation window and is only re-enabled inside the `setTimeout` callback if the player's balance is at least $10\text{ PTS}$.

### 3. Jackpot Evaluation & Game-Over Lock
Once the final symbols `r1`, `r2`, and `r3` lock into place, `evaluateOutcome(r1, r2, r3)` runs:
* **3-Way Match Jackpot:** Evaluates `if (r1 === r2 && r2 === r3)`. When true, awards $+100\text{ PTS}$, increments the jackpot counter, triggers the pulsing `.jackpot-win` cabinet glow, and plays a synthesized fanfare.
* **Game Over Guard:** If the player's balance drops below the $10\text{ PTS}$ spin cost (`score < 10`), the spin button locks permanently until the player clicks **Insert Coin (Reset 100)**.

---

## Game Mechanics & Economy

* **Starting Balance:** $100\text{ PTS}$
* **Spin Cost:** $-10\text{ PTS}$ (deducted immediately upon spin initiation)
* **Random Reel Selection:**
  $$\text{Index} = \lfloor \text{Math.random()} \times \text{emojis.length} \rfloor$$
* **3-Way Jackpot Payout:** $+100\text{ PTS}$ when $\text{Reel}_1 = \text{Reel}_2 = \text{Reel}_3$

---

## Key Features

* **100% Native UTF-8 Emojis & Web Audio:** Zero external images, sprites, or audio files. Uses native UTF-8 emoji decks (`🍒`, `🍋`, `🔔`, `⭐`, `💎`, `7️⃣`) and the browser's `AudioContext` API to synthesize arcade ticks and win fanfares.
* **4 Arcade Cabinet Themes:** Switch live between **Vegas Gold**, **Cyberpunk**, **Tokyo**, and **Matrix** cabinets.
* **3 Switchable Symbol Decks:** Choose between **Classic**, **Tech**, and **Fruits** emoji decks.
* **Keyboard Accessibility:** Press **Spacebar** or click **SPIN REELS (-10)** to play.

---

## Strict 3-File Project Structure

```text
emoji-slots/
├── index.html   # Semantic HTML5 arcade cabinet structure (zero inline styles or scripts)
├── style.css    # Gold cabinet borders, marquee chase lights, and .rolling blur filter
└── script.js    # 75ms/1500ms timer loop, concurrency lock, jackpot check, and Web Audio
```

---

## Local Setup & Vercel Deployment

1. **Run Locally:** Clone this repository and open `index.html` in any modern web browser.
2. **Deploy on Vercel:**
   * Push this folder to a public GitHub repository.
   * Import the repository into [vercel.com](https://vercel.com) with **Framework Preset** set to `Other`.
   * Click **Deploy** to generate your live HTTPS production link.
