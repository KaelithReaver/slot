/* ==========================================================================
   LUCKY-3 // Interactive Mechanical Lever, 3-Reel Physics & Web Audio Synth
   ========================================================================== */

(() => {
  "use strict";

  // --------------------------------------------------------------------------
  // 1. Symbol Decks & Theme Configuration
  // --------------------------------------------------------------------------
  const DECKS = {
    classic: ["7️⃣", "💎", "🔔", "🍀", "⭐"],
    tech: ["💻", "⚡", "🤖", "🚀", "🛡️"],
    fruits: ["🍒", "🍋", "🍉", "🍇", "🍊"]
  };

  const STARTING_CREDITS = 100;
  const JACKPOT_REWARD = 100;
  const NEAR_MISS_CONSOLATION = 2;
  const CELL_HEIGHT = 74;
  const STRIP_REPEAT_CYCLES = 8; // Cycles of 5 symbols = 40 cells per reel

  const state = {
    theme: "vegas",
    deckKey: "classic",
    credits: STARTING_CREDITS,
    spinCost: 10,
    lastWin: 0,
    totalSpins: 0,
    muted: false,
    isSpinning: false,
    gameOver: false,

    // Per-reel animation control
    reelAnimIds: [null, null, null],
    reelStopTimers: [null, null, null],
    reelSettled: [true, true, true],
    reelTargets: [0, 0, 0],
    reelStartOffsets: [0, 0, 0],
    reelStoppedCallbacks: [null, null, null],

    // Marquee bulbs
    bulbStep: 0,
    bulbMode: "idle" // 'idle' | 'spin' | 'jackpot' | 'nearmiss' | 'gameover'
  };

  // --------------------------------------------------------------------------
  // 2. DOM Elements
  // --------------------------------------------------------------------------
  const el = {
    root: document.documentElement,
    fxCanvas: document.getElementById("fxCanvas"),
    slotCabinet: document.getElementById("slotCabinet"),
    marqueeHeading: document.getElementById("marqueeHeading"),
    marqueeStatusBar: document.getElementById("marqueeStatusBar"),
    bulbRowTop: document.getElementById("bulbRowTop"),
    bulbRowBottom: document.getElementById("bulbRowBottom"),

    creditsReadout: document.getElementById("creditsReadout"),
    costReadout: document.getElementById("costReadout"),
    lastWinReadout: document.getElementById("lastWinReadout"),
    spinsReadout: document.getElementById("spinsReadout"),
    deckPreview: document.getElementById("deckPreview"),

    paylineBeam: document.getElementById("paylineBeam"),
    outcomeBanner: document.getElementById("outcomeBanner"),
    outcomeTitle: document.getElementById("outcomeTitle"),
    outcomeSub: document.getElementById("outcomeSub"),

    reels: [
      document.getElementById("reel0"),
      document.getElementById("reel1"),
      document.getElementById("reel2")
    ],
    reelSlots: Array.from(document.querySelectorAll(".reel-slot")),
    slamBtns: Array.from(document.querySelectorAll(".slam-btn")),

    spinBtn: document.getElementById("spinBtn"),
    spinBtnSub: document.getElementById("spinBtnSub"),
    resetBtn: document.getElementById("resetBtn"),
    muteBtn: document.getElementById("muteBtn"),
    muteLabel: document.getElementById("muteLabel"),
    historyStrip: document.getElementById("historyStrip"),

    leverHousing: document.getElementById("leverHousing"),
    leverKnob: document.getElementById("leverKnob"),
    leverShaft: document.getElementById("leverShaft"),
    leverTensionFill: document.getElementById("leverTensionFill"),
    leverGuideText: document.getElementById("leverGuideText")
  };

  // --------------------------------------------------------------------------
  // 3. Web Audio Retro Arcade Synthesizer
  // --------------------------------------------------------------------------
  let audioCtx = null;
  let spinTickInterval = null;

  function ensureAudio() {
    if (state.muted) return null;
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playTone(freq, duration, type = "square", volume = 0.08, delay = 0, slideTo = null) {
    const ctx = ensureAudio();
    if (!ctx) return;

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo !== null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), now + duration);
    }

    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.01);
  }

  const sfx = {
    ratchet(progress) {
      playTone(220 + progress * 240, 0.028, "triangle", 0.045, 0, 120);
    },
    leverLatch() {
      playTone(170, 0.07, "sawtooth", 0.09, 0, 95);
      playTone(540, 0.05, "square", 0.06, 0.04, 720);
    },
    startSpinLoop() {
      this.stopSpinLoop();
      let step = 0;
      spinTickInterval = window.setInterval(() => {
        if (!state.isSpinning || state.muted) return;
        const f = 145 + (step % 4) * 28;
        playTone(f, 0.032, "square", 0.032, 0, f * 0.75);
        step++;
      }, 72);
    },
    stopSpinLoop() {
      if (spinTickInterval) {
        clearInterval(spinTickInterval);
        spinTickInterval = null;
      }
    },
    reelStop(reelIdx, slam = false) {
      const base = [165, 195, 235][reelIdx] || 180;
      playTone(base, 0.085, "triangle", slam ? 0.12 : 0.09, 0, 70);
      playTone(base * 2.4, 0.045, "square", 0.045, 0.015);
    },
    nearMiss() {
      playTone(440, 0.11, "triangle", 0.08, 0, 520);
      playTone(523.25, 0.14, "triangle", 0.08, 0.11, 392);
      playTone(659.25, 0.18, "sine", 0.07, 0.24);
    },
    jackpot() {
      const melody = [
        [523.25, 0.09, 0],
        [659.25, 0.09, 0.09],
        [783.99, 0.09, 0.18],
        [1046.5, 0.16, 0.27],
        [783.99, 0.09, 0.44],
        [1046.5, 0.35, 0.54]
      ];
      melody.forEach(([f, dur, del]) => {
        playTone(f, dur, "square", 0.085, del);
        playTone(f * 0.5, dur, "triangle", 0.06, del);
      });
      // Coin cascade pings
      for (let i = 0; i < 6; i++) {
        playTone(1350 + i * 110, 0.07, "sine", 0.055, 0.62 + i * 0.08, 1900);
      }
    },
    gameOver() {
      playTone(280, 0.16, "sawtooth", 0.08, 0, 210);
      playTone(210, 0.18, "sawtooth", 0.08, 0.16, 150);
      playTone(150, 0.32, "sawtooth", 0.09, 0.34, 85);
    },
    reload() {
      playTone(392, 0.07, "square", 0.07, 0);
      playTone(523.25, 0.07, "square", 0.07, 0.08);
      playTone(659.25, 0.09, "square", 0.07, 0.16);
      playTone(783.99, 0.16, "square", 0.08, 0.25);
    },
    uiClick() {
      playTone(640, 0.03, "sine", 0.04, 0, 420);
    }
  };

  // --------------------------------------------------------------------------
  // 4. Canvas Coin & Spark Celebration System
  // --------------------------------------------------------------------------
  const fxCtx = el.fxCanvas.getContext("2d");
  let particles = [];
  let fxRaf = null;

  function resizeFxCanvas() {
    el.fxCanvas.width = window.innerWidth;
    el.fxCanvas.height = window.innerHeight;
  }

  function spawnCelebrationParticles(count, mode = "jackpot") {
    resizeFxCanvas();
    const rect = el.slotCabinet.getBoundingClientRect();
    const originX = rect.left + rect.width / 2;
    const originY = rect.top + rect.height * 0.45;

    const palette =
      mode === "jackpot"
        ? ["#ffd447", "#fff4b8", "#ff6b3d", "#45f0df"]
        : ["#f0a83b", "#ffe3a3"];

    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const speed = 4 + Math.random() * 9;
      particles.push({
        x: originX + (Math.random() - 0.5) * 140,
        y: originY + (Math.random() - 0.5) * 30,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        size: mode === "jackpot" ? 5 + Math.random() * 6 : 3 + Math.random() * 3,
        color: palette[Math.floor(Math.random() * palette.length)],
        life: 1,
        decay: 0.012 + Math.random() * 0.012,
        rot: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 0.25
      });
    }

    if (!fxRaf) {
      fxLoop();
    }
  }

  function fxLoop() {
    fxCtx.clearRect(0, 0, el.fxCanvas.width, el.fxCanvas.height);
    particles = particles.filter((p) => p.life > 0);

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.26; // gravity
      p.rot += p.vRot;
      p.life -= p.decay;

      fxCtx.save();
      fxCtx.globalAlpha = Math.max(0, p.life);
      fxCtx.translate(p.x, p.y);
      fxCtx.rotate(p.rot);
      fxCtx.fillStyle = p.color;
      fxCtx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.72);
      fxCtx.restore();
    }

    if (particles.length > 0) {
      fxRaf = requestAnimationFrame(fxLoop);
    } else {
      fxRaf = null;
      fxCtx.clearRect(0, 0, el.fxCanvas.width, el.fxCanvas.height);
    }
  }

  // --------------------------------------------------------------------------
  // 5. Marquee Chasing Bulbs
  // --------------------------------------------------------------------------
  function buildMarqueeBulbs() {
    const count = 16;
    el.bulbRowTop.innerHTML = "";
    el.bulbRowBottom.innerHTML = "";

    for (let i = 0; i < count; i++) {
      const bTop = document.createElement("span");
      bTop.className = "bulb";
      el.bulbRowTop.appendChild(bTop);

      const bBot = document.createElement("span");
      bBot.className = "bulb";
      el.bulbRowBottom.appendChild(bBot);
    }
  }

  function tickMarqueeBulbs() {
    const topBulbs = el.bulbRowTop.children;
    const botBulbs = el.bulbRowBottom.children;
    const len = topBulbs.length;
    state.bulbStep = (state.bulbStep + 1) % 1000;

    for (let i = 0; i < len; i++) {
      let lit = false;
      if (state.bulbMode === "jackpot") {
        lit = state.bulbStep % 2 === 0 ? i % 2 === 0 : i % 2 === 1;
      } else if (state.bulbMode === "spin") {
        lit = (i + state.bulbStep) % 3 === 0;
      } else if (state.bulbMode === "nearmiss") {
        lit = state.bulbStep % 2 === 0;
      } else if (state.bulbMode === "gameover") {
        lit = false;
      } else {
        lit = (i + state.bulbStep) % 4 === 0;
      }

      topBulbs[i].classList.toggle("lit", lit);
      botBulbs[len - 1 - i].classList.toggle("lit", lit);
    }
  }

  // --------------------------------------------------------------------------
  // 6. Reel Rendering & Staggered Physics Engine
  // --------------------------------------------------------------------------
  function getDeckSymbols() {
    return DECKS[state.deckKey];
  }

  function populateReels() {
    const symbols = getDeckSymbols();
    el.deckPreview.textContent = symbols.join(" ");

    el.reels.forEach((drum, rIdx) => {
      drum.innerHTML = "";
      for (let cycle = 0; cycle < STRIP_REPEAT_CYCLES; cycle++) {
        for (let sIdx = 0; sIdx < symbols.length; sIdx++) {
          const cell = document.createElement("div");
          cell.className = "reel-cell";
          cell.textContent = symbols[sIdx];
          drum.appendChild(cell);
        }
      }
      // Position initial middle window cleanly on cycle 1
      const initialSymbol = state.reelTargets[rIdx] || 0;
      const offsetIndex = symbols.length + initialSymbol;
      // Offset - 1 cell so target sits in center row (row 1 of 3 visible rows)
      const y = -((offsetIndex - 1) * CELL_HEIGHT);
      state.reelStartOffsets[rIdx] = y;
      drum.style.transform = `translateY(${y}px)`;
    });
  }

  function updateHud() {
    el.creditsReadout.textContent = state.credits;
    el.costReadout.textContent = state.spinCost;
    el.lastWinReadout.textContent = state.lastWin;
    el.spinsReadout.textContent = state.totalSpins;
    el.spinBtnSub.textContent = `-${state.spinCost} CR`;

    el.creditsReadout.classList.toggle("low-warn", state.credits <= state.spinCost);

    const canSpin = !state.isSpinning && !state.gameOver && state.credits >= state.spinCost;
    el.spinBtn.disabled = !canSpin;
    el.leverHousing.classList.toggle("is-disabled", !canSpin);

    // Disable deck & wager changes mid-spin
    document.querySelectorAll("[data-deck-btn], [data-bet]").forEach((btn) => {
      btn.disabled = state.isSpinning;
    });
  }

  function showOutcomeBanner(type, title, sub) {
    el.outcomeBanner.className = `outcome-banner ${type}`;
    el.outcomeTitle.textContent = title;
    el.outcomeSub.textContent = sub;
  }

  function hideOutcomeBanner() {
    el.outcomeBanner.className = "outcome-banner hidden";
  }

  function clearVisualHighlights() {
    el.paylineBeam.className = "payline-beam";
    el.reelSlots.forEach((slot) => slot.classList.remove("is-locked-match"));
  }

  function addHistoryChip(symbolsText, label, kind) {
    const emptyMsg = el.historyStrip.querySelector(".history-empty");
    if (emptyMsg) emptyMsg.remove();

    const chip = document.createElement("span");
    chip.className = `hist-chip ${kind}`;
    chip.textContent = `${symbolsText} ${label}`;
    el.historyStrip.prepend(chip);

    while (el.historyStrip.children.length > 10) {
      el.historyStrip.removeChild(el.historyStrip.lastElementChild);
    }
  }

  function easeOutBack(t) {
    const c1 = 1.45;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  function spinSingleReel(rIdx, targetSymIdx, durationMs, onComplete) {
    const symbols = getDeckSymbols();
    const drum = el.reels[rIdx];
    const slot = el.reelSlots[rIdx];

    state.reelSettled[rIdx] = false;
    state.reelStoppedCallbacks[rIdx] = onComplete;
    slot.classList.add("is-spinning");
    el.slamBtns[rIdx].disabled = false;

    // Reset start position to cycle 1 equivalent so we always travel far downward
    const currentSym = state.reelTargets[rIdx];
    const startIdx = symbols.length + currentSym;
    const startY = -((startIdx - 1) * CELL_HEIGHT);

    // Land near cycle 5 or 6 for long rich spin
    const targetCycle = 4 + rIdx;
    const endIdx = targetCycle * symbols.length + targetSymIdx;
    const endY = -((endIdx - 1) * CELL_HEIGHT);

    state.reelTargets[rIdx] = targetSymIdx;
    const startTime = performance.now();

    function frame(now) {
      if (state.reelSettled[rIdx]) return;
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / durationMs);
      const eased = easeOutBack(t);
      const currentY = startY + (endY - startY) * eased;
      drum.style.transform = `translateY(${currentY}px)`;

      if (t < 1) {
        state.reelAnimIds[rIdx] = requestAnimationFrame(frame);
      } else {
        finalizeSingleReel(rIdx, targetSymIdx, false);
      }
    }

    state.reelAnimIds[rIdx] = requestAnimationFrame(frame);
  }

  function finalizeSingleReel(rIdx, targetSymIdx, isSlamStop) {
    if (state.reelSettled[rIdx]) return;
    state.reelSettled[rIdx] = true;

    if (state.reelAnimIds[rIdx]) {
      cancelAnimationFrame(state.reelAnimIds[rIdx]);
      state.reelAnimIds[rIdx] = null;
    }

    const symbols = getDeckSymbols();
    const settledIdx = symbols.length + targetSymIdx;
    const settledY = -((settledIdx - 1) * CELL_HEIGHT);

    el.reels[rIdx].style.transform = `translateY(${settledY}px)`;
    el.reelSlots[rIdx].classList.remove("is-spinning");
    el.slamBtns[rIdx].disabled = true;

    sfx.reelStop(rIdx, isSlamStop);

    const cb = state.reelStoppedCallbacks[rIdx];
    state.reelStoppedCallbacks[rIdx] = null;
    if (typeof cb === "function") cb();
  }

  function triggerSpin() {
    if (state.isSpinning || state.gameOver) return;

    // If credits > 0 but less than selected bet, auto-adjust to affordable bet
    if (state.credits < state.spinCost && state.credits > 0) {
      const affordable = [20, 10, 5].find((b) => b <= state.credits);
      if (affordable) {
        setSpinCost(affordable);
      } else {
        state.spinCost = state.credits;
      }
    }

    if (state.credits < state.spinCost) {
      triggerGameOver();
      return;
    }

    // Deduct cost
    state.credits -= state.spinCost;
    state.totalSpins += 1;
    state.lastWin = 0;
    state.isSpinning = true;
    state.bulbMode = "spin";

    hideOutcomeBanner();
    clearVisualHighlights();
    el.marqueeStatusBar.textContent = "REELS IN MOTION — SLAM STOP OR WAIT";
    updateHud();

    const symbols = getDeckSymbols();
    // Weighted fair RNG per reel
    const picked = [
      Math.floor(Math.random() * symbols.length),
      Math.floor(Math.random() * symbols.length),
      Math.floor(Math.random() * symbols.length)
    ];

    // Dramatic suspense: if Reel 1 & Reel 2 match, extend Reel 3 spin slightly
    const suspenseMatch = picked[0] === picked[1];
    const durations = [1050, 1650, suspenseMatch ? 2650 : 2200];

    sfx.startSpinLoop();

    let completedCount = 0;
    const onEachDone = (rIdx) => {
      completedCount++;
      if (rIdx === 1 && suspenseMatch && !state.reelSettled[2]) {
        el.marqueeStatusBar.textContent = "TWO MATCHED! REEL 3 TENSION...";
        el.reelSlots[0].classList.add("is-locked-match");
        el.reelSlots[1].classList.add("is-locked-match");
      }
      if (completedCount === 3) {
        resolveSpinOutcome(picked);
      }
    };

    picked.forEach((symIdx, rIdx) => {
      spinSingleReel(rIdx, symIdx, durations[rIdx], () => onEachDone(rIdx));
    });
  }

  function resolveSpinOutcome(picked) {
    sfx.stopSpinLoop();
    state.isSpinning = false;

    const symbols = getDeckSymbols();
    const [a, b, c] = picked;
    const symString = `${symbols[a]}${symbols[b]}${symbols[c]}`;

    const isJackpot = a === b && b === c;
    const isNearMiss = !isJackpot && (a === b || b === c || a === c);

    if (isJackpot) {
      state.credits += JACKPOT_REWARD;
      state.lastWin = JACKPOT_REWARD;
      state.bulbMode = "jackpot";

      el.paylineBeam.classList.add("is-jackpot");
      el.reelSlots.forEach((s) => s.classList.add("is-locked-match"));
      el.slotCabinet.classList.remove("cabinet-shake");
      void el.slotCabinet.offsetWidth;
      el.slotCabinet.classList.add("cabinet-shake");

      el.marqueeStatusBar.textContent = "TRIPLE MATCH JACKPOT! +100 CREDITS!";
      showOutcomeBanner("jackpot", "JACKPOT! 3-WAY MATCH!", `+${JACKPOT_REWARD} CREDITS AWARDED`);
      addHistoryChip(symString, `+${JACKPOT_REWARD} CR`, "win");
      sfx.jackpot();
      spawnCelebrationParticles(75, "jackpot");
    } else if (isNearMiss) {
      state.credits += NEAR_MISS_CONSOLATION;
      state.lastWin = NEAR_MISS_CONSOLATION;
      state.bulbMode = "nearmiss";

      el.paylineBeam.classList.add("is-nearmiss");
      if (a === b) {
        el.reelSlots[0].classList.add("is-locked-match");
        el.reelSlots[1].classList.add("is-locked-match");
      } else if (b === c) {
        el.reelSlots[1].classList.add("is-locked-match");
        el.reelSlots[2].classList.add("is-locked-match");
      } else {
        el.reelSlots[0].classList.add("is-locked-match");
        el.reelSlots[2].classList.add("is-locked-match");
      }

      el.marqueeStatusBar.textContent = `NEAR MISS! SO CLOSE (+${NEAR_MISS_CONSOLATION} CR)`;
      showOutcomeBanner("nearmiss", "NEAR MISS!", `2 OF 3 MATCHED • +${NEAR_MISS_CONSOLATION} CR CONSOLATION`);
      addHistoryChip(symString, `NEAR +${NEAR_MISS_CONSOLATION}`, "near");
      sfx.nearMiss();
      spawnCelebrationParticles(18, "nearmiss");
    } else {
      state.bulbMode = "idle";
      el.marqueeStatusBar.textContent = "NO MATCH — PULL AGAIN!";
      addHistoryChip(symString, "0 CR", "loss");
    }

    // Check Game Over (0 credits)
    if (state.credits <= 0) {
      state.credits = 0;
      triggerGameOver();
    } else if (state.credits < state.spinCost) {
      const affordable = [20, 10, 5].find((bet) => bet <= state.credits);
      if (affordable) setSpinCost(affordable);
    }

    updateHud();
  }

  function triggerGameOver() {
    state.gameOver = true;
    state.bulbMode = "gameover";
    el.marqueeStatusBar.textContent = "OUT OF CREDITS — INSERT COIN TO CONTINUE";
    showOutcomeBanner("gameover", "GAME OVER", "0 CREDITS REMAINING — RELOAD TO PLAY");
    el.resetBtn.classList.remove("hidden");
    sfx.gameOver();
    updateHud();
  }

  function resetGame() {
    state.credits = STARTING_CREDITS;
    state.lastWin = 0;
    state.totalSpins = 0;
    state.gameOver = false;
    state.bulbMode = "idle";
    setSpinCost(10);

    hideOutcomeBanner();
    clearVisualHighlights();
    el.resetBtn.classList.add("hidden");
    el.marqueeStatusBar.textContent = "CREDITS RESTORED — PULL LEVER TO SPIN!";
    sfx.reload();
    updateHud();
  }

  function setSpinCost(cost) {
    state.spinCost = cost;
    document.querySelectorAll("[data-bet]").forEach((btn) => {
      btn.classList.toggle("active", Number(btn.dataset.bet) === cost);
    });
    updateHud();
  }

  // --------------------------------------------------------------------------
  // 7. Interactive Mechanical Pull Lever Physics (Pointer Drag + Click)
  // --------------------------------------------------------------------------
  const lever = {
    dragging: false,
    startY: 0,
    pullPx: 0,
    maxPullPx: 148,
    triggerThresholdPx: 108,
    tripped: false,
    lastRatchetBucket: 0
  };

  function updateLeverVisuals(px) {
    const clamped = Math.max(0, Math.min(lever.maxPullPx, px));
    const ratio = clamped / lever.maxPullPx;

    // Move knob down and extend shaft cleanly on desktop vertical track
    el.leverKnob.style.top = `${clamped}px`;
    el.leverShaft.style.height = `${18 + clamped}px`;
    el.leverTensionFill.style.height = `${ratio * 100}%`;

    if (clamped >= lever.triggerThresholdPx) {
      el.leverGuideText.innerHTML = "RELEASE<br/>SPIN!";
    } else if (clamped > 10) {
      el.leverGuideText.innerHTML = "PULL<br/>MORE!";
    } else {
      el.leverGuideText.innerHTML = "DRAG<br/>DOWN";
    }
  }

  function springLeverBack() {
    el.leverKnob.style.transition = "top 240ms cubic-bezier(0.34, 1.56, 0.64, 1)";
    el.leverShaft.style.transition = "height 240ms cubic-bezier(0.34, 1.56, 0.64, 1)";
    el.leverTensionFill.style.transition = "height 240ms ease";

    updateLeverVisuals(0);

    window.setTimeout(() => {
      el.leverKnob.style.transition = "";
      el.leverShaft.style.transition = "";
      el.leverTensionFill.style.transition = "";
    }, 260);
  }

  function animateFullLeverPull() {
    if (state.isSpinning || state.gameOver || state.credits < state.spinCost) return;
    el.leverKnob.style.transition = "top 150ms cubic-bezier(0.22, 1, 0.36, 1)";
    el.leverShaft.style.transition = "height 150ms cubic-bezier(0.22, 1, 0.36, 1)";
    el.leverTensionFill.style.transition = "height 150ms ease";

    updateLeverVisuals(lever.maxPullPx);
    sfx.leverLatch();

    window.setTimeout(() => {
      triggerSpin();
      springLeverBack();
    }, 165);
  }

  el.leverKnob.addEventListener("pointerdown", (e) => {
    if (state.isSpinning || state.gameOver || state.credits < state.spinCost) return;
    e.preventDefault();
    lever.dragging = true;
    lever.startY = e.clientY;
    lever.pullPx = 0;
    lever.tripped = false;
    lever.lastRatchetBucket = 0;
    el.leverHousing.classList.add("is-dragging");
    el.leverKnob.setPointerCapture(e.pointerId);
  });

  el.leverKnob.addEventListener("pointermove", (e) => {
    if (!lever.dragging) return;
    const deltaY = e.clientY - lever.startY;
    lever.pullPx = Math.max(0, Math.min(lever.maxPullPx, deltaY));
    updateLeverVisuals(lever.pullPx);

    const bucket = Math.floor(lever.pullPx / 24);
    if (bucket > lever.lastRatchetBucket) {
      lever.lastRatchetBucket = bucket;
      sfx.ratchet(lever.pullPx / lever.maxPullPx);
    }

    if (lever.pullPx >= lever.triggerThresholdPx && !lever.tripped) {
      lever.tripped = true;
      sfx.leverLatch();
    }
  });

  function finishLeverPointer(e) {
    if (!lever.dragging) return;
    lever.dragging = false;
    el.leverHousing.classList.remove("is-dragging");

    if (lever.tripped || lever.pullPx >= lever.triggerThresholdPx) {
      triggerSpin();
      springLeverBack();
    } else if (lever.pullPx < 8) {
      // Treat a quick tap/click on the knob as a full mechanical pull
      animateFullLeverPull();
    } else {
      springLeverBack();
    }

    try {
      el.leverKnob.releasePointerCapture(e.pointerId);
    } catch (_) {}
  }

  el.leverKnob.addEventListener("pointerup", finishLeverPointer);
  el.leverKnob.addEventListener("pointercancel", finishLeverPointer);

  // --------------------------------------------------------------------------
  // 8. UI Controls & Keyboard Shortcuts
  // --------------------------------------------------------------------------
  el.spinBtn.addEventListener("click", animateFullLeverPull);
  el.resetBtn.addEventListener("click", resetGame);

  el.slamBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.stopReel);
      if (state.isSpinning && !state.reelSettled[idx]) {
        finalizeSingleReel(idx, state.reelTargets[idx], true);
      }
    });
  });

  document.querySelectorAll("[data-theme-btn]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.theme = btn.dataset.themeBtn;
      el.root.setAttribute("data-theme", state.theme);
      document.querySelectorAll("[data-theme-btn]").forEach((b) => {
        b.classList.toggle("active", b === btn);
      });
      sfx.uiClick();
    });
  });

  document.querySelectorAll("[data-deck-btn]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (state.isSpinning) return;
      state.deckKey = btn.dataset.deckBtn;
      document.querySelectorAll("[data-deck-btn]").forEach((b) => {
        b.classList.toggle("active", b === btn);
      });
      clearVisualHighlights();
      hideOutcomeBanner();
      populateReels();
      sfx.uiClick();
    });
  });

  document.querySelectorAll("[data-bet]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (state.isSpinning) return;
      const val = Number(btn.dataset.bet);
      if (val <= state.credits || state.credits === 0) {
        setSpinCost(val);
        sfx.uiClick();
      }
    });
  });

  el.muteBtn.addEventListener("click", () => {
    state.muted = !state.muted;
    el.muteBtn.classList.toggle("is-muted", state.muted);
    el.muteBtn.setAttribute("aria-pressed", String(state.muted));
    el.muteLabel.textContent = state.muted ? "MUTED" : "SFX ON";
    if (state.muted) {
      sfx.stopSpinLoop();
    } else {
      sfx.uiClick();
    }
  });

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      animateFullLeverPull();
    } else if (e.key === "1" || e.key === "2" || e.key === "3") {
      const idx = Number(e.key) - 1;
      if (state.isSpinning && !state.reelSettled[idx]) {
        finalizeSingleReel(idx, state.reelTargets[idx], true);
      }
    }
  });

  window.addEventListener("resize", resizeFxCanvas);

  // --------------------------------------------------------------------------
  // 9. Initialization
  // --------------------------------------------------------------------------
  function init() {
    resizeFxCanvas();
    buildMarqueeBulbs();
    populateReels();
    updateHud();
    window.setInterval(tickMarqueeBulbs, 260);
  }

  init();
})();