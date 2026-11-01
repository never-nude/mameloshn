(() => {
  "use strict";

  const lessons = Array.isArray(window.MAMELOSHN_LESSONS)
    ? window.MAMELOSHN_LESSONS
    : [];
  const config = window.MAMELOSHN_COURSE_CONFIG || {};
  const STORAGE_KEY = "mameloshn.learning-state.v1";
  const NAV_ITEMS = [
    { id: "home", label: "Home", icon: "⌂" },
    { id: "learn", label: "Learn", icon: "▤" },
    { id: "practice", label: "Practice", icon: "◆" },
    { id: "phrasebook", label: "Phrasebook", icon: "≡" },
    { id: "family", label: "Family words", shortLabel: "Family", icon: "♥" },
  ];
  const TONE_COLORS = {
    plum: "#53284d",
    beet: "#9e2536",
    honey: "#a76509",
    sage: "#356148",
    blue: "#386791",
    clay: "#8c422e",
  };

  const main = document.querySelector("#main-content");
  const appShell = document.querySelector("#app-shell");
  const sideNav = document.querySelector("#side-nav");
  const bottomNav = document.querySelector("#bottom-nav");
  const modalRoot = document.querySelector("#modal-root");
  const toastRegion = document.querySelector("#toast-region");
  const storageWarning = document.querySelector("#storage-warning");
  const sidebarRoots = document.querySelector("#sidebar-roots");
  const headerXP = document.querySelector("#header-xp");

  let storageAvailable = true;
  let storageWarningShown = false;
  let state = loadState();
  let ui = {
    section: sectionFromHash(),
    session: null,
    practice: null,
    phraseQuery: "",
    lessonDetail: null,
    modal: null,
    lastFocused: null,
  };
  let voices = [];

  const coreEntries = lessons.flatMap((lesson) =>
    lesson.phrases.map((phrase) => ({ lesson, phrase }))
  );

  if (!storageAvailable) storageWarning.hidden = false;
  buildNavigation();
  resetDailyXPIfNeeded();
  bindEvents();
  loadSpeechVoices();
  render();

  if (!state.hasSeenWelcome) {
    openWelcome();
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {
        // The course remains fully usable online if offline setup is unavailable.
      });
    });
  }

  function defaultState() {
    return {
      version: 1,
      learnedPhraseIDs: [],
      reviewStates: {},
      familyPhrases: [],
      familyRoots: config.heritageTrack || "Bessarabia–Odessa",
      hasSeenWelcome: false,
      totalXP: 0,
      dailyXP: 0,
      currentStreak: 0,
      lastActiveDay: null,
    };
  }

  function normalizeState(candidate) {
    const base = defaultState();
    if (!candidate || typeof candidate !== "object") return base;
    return {
      ...base,
      version: 1,
      learnedPhraseIDs: Array.isArray(candidate.learnedPhraseIDs)
        ? [...new Set(candidate.learnedPhraseIDs.filter((id) => typeof id === "string"))]
        : [],
      reviewStates:
        candidate.reviewStates && typeof candidate.reviewStates === "object"
          ? candidate.reviewStates
          : {},
      familyPhrases: Array.isArray(candidate.familyPhrases)
        ? candidate.familyPhrases
            .filter((item) => item && typeof item === "object")
            .map((item) => ({
              id: String(item.id || makeID()),
              transliteration: String(item.transliteration || "").trim(),
              meaning: String(item.meaning || "").trim(),
              pronunciation: String(item.pronunciation || "").trim(),
              memory: String(item.memory || "").trim(),
              place: String(item.place || "").trim(),
              createdAt: item.createdAt || new Date().toISOString(),
            }))
            .filter((item) => item.transliteration && item.meaning)
        : [],
      familyRoots:
        typeof candidate.familyRoots === "string"
          ? candidate.familyRoots
          : base.familyRoots,
      hasSeenWelcome: Boolean(candidate.hasSeenWelcome),
      totalXP: safeNumber(candidate.totalXP),
      dailyXP: safeNumber(candidate.dailyXP),
      currentStreak: safeNumber(candidate.currentStreak),
      lastActiveDay:
        typeof candidate.lastActiveDay === "string" ? candidate.lastActiveDay : null,
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return normalizeState(raw ? JSON.parse(raw) : null);
    } catch (_error) {
      storageAvailable = false;
      return defaultState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      storageAvailable = true;
      storageWarning.hidden = true;
      return true;
    } catch (_error) {
      storageAvailable = false;
      storageWarning.hidden = false;
      if (!storageWarningShown) {
        storageWarningShown = true;
        showToast("Browser storage is unavailable; changes may disappear after this visit.");
      }
      return false;
    }
  }

  function safeNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
  }

  function buildNavigation() {
    const markup = NAV_ITEMS.map(
      (item) => `
        <button class="nav-button" type="button" data-go="${item.id}" data-nav="${item.id}">
          <span class="nav-icon" aria-hidden="true">${item.icon}</span>
          <span>${esc(item.label)}</span>
        </button>`
    ).join("");
    sideNav.innerHTML = markup;
    bottomNav.innerHTML = NAV_ITEMS.map(
      (item) => `
        <button class="nav-button" type="button" data-go="${item.id}" data-nav="${item.id}">
          <span class="nav-icon" aria-hidden="true">${item.icon}</span>
          <span>${esc(item.shortLabel || item.label)}</span>
        </button>`
    ).join("");
  }

  function bindEvents() {
    document.addEventListener("click", handleClick);
    document.addEventListener("input", handleInput);
    document.addEventListener("change", handleChange);
    document.addEventListener("submit", (event) => {
      if (event.target.matches("#family-form")) {
        event.preventDefault();
        saveFamilyWord();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (ui.modal && event.key === "Tab") trapModalFocus(event);
      if (event.key === "Escape" && ui.modal && ui.modal !== "welcome") closeModal();
      if (
        event.key === "Enter" &&
        ui.session &&
        !ui.session.complete &&
        event.target.tagName !== "BUTTON"
      ) {
        const action = ui.session.checked ? "continue-question" : "check-answer";
        handleAction(action, event.target);
      }
    });
    window.addEventListener("hashchange", () => {
      const next = sectionFromHash(ui.section);
      if (next !== ui.section) {
        ui.section = next;
        ui.session = null;
        ui.lessonDetail = null;
        document.body.classList.remove("in-session");
        window.speechSynthesis?.cancel?.();
        if (next !== "practice") ui.practice = null;
        render();
        focusMain();
      }
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) window.speechSynthesis?.cancel?.();
    });
  }

  function handleClick(event) {
    const backdrop = event.target.closest(".modal-backdrop");
    if (backdrop && event.target === backdrop && ui.modal !== "welcome") {
      closeModal();
      return;
    }

    const goButton = event.target.closest("[data-go]");
    if (goButton) {
      go(goButton.dataset.go);
      return;
    }

    const lessonButton = event.target.closest("[data-start-lesson]");
    if (lessonButton) {
      startLesson(lessonButton.dataset.startLesson);
      return;
    }

    const lessonDetailButton = event.target.closest("[data-open-lesson]");
    if (lessonDetailButton) {
      ui.lessonDetail = lessonDetailButton.dataset.openLesson;
      render();
      focusMain();
      return;
    }

    const option = event.target.closest("[data-option-index]");
    if (option && ui.session && !ui.session.checked) {
      const optionIndex = Number(option.dataset.optionIndex);
      ui.session.selected = optionIndex;
      renderSession();
      requestAnimationFrame(() =>
        document.querySelector(`[data-option-index="${optionIndex}"]`)?.focus()
      );
      return;
    }

    const actionButton = event.target.closest("[data-action]");
    if (actionButton) {
      handleAction(actionButton.dataset.action, actionButton);
    }
  }

  function handleInput(event) {
    if (event.target.matches("[data-phrase-search]")) {
      ui.phraseQuery = event.target.value;
      renderPhraseResults();
    }
    if (event.target.matches("[data-family-roots]")) {
      state.familyRoots = event.target.value;
      sidebarRoots.textContent = state.familyRoots.trim() || config.heritageTrack;
      saveState();
    }
  }

  function handleChange(event) {
    if (event.target.matches("[data-import-file]")) {
      importBackup(event.target.files && event.target.files[0]);
    }
  }

  function handleAction(action, button) {
    switch (action) {
      case "open-welcome":
        openWelcome();
        break;
      case "finish-welcome":
        state.hasSeenWelcome = true;
        saveState();
        closeModal();
        go("learn");
        break;
      case "close-modal":
        closeModal();
        break;
      case "exit-session":
        ui.session = null;
        window.speechSynthesis?.cancel?.();
        document.body.classList.remove("in-session");
        render();
        focusMain();
        break;
      case "check-answer":
        checkAnswer();
        break;
      case "continue-question":
        continueQuestion();
        break;
      case "play":
      case "play-slow": {
        const entry = findEntry(button.dataset.phraseId);
        if (entry) {
          const didSpeak = speak(entry.phrase, action === "play-slow");
          const challenge = ui.session?.challenges?.[ui.session.index];
          if (
            challenge?.mode?.id === "listenForMeaning" &&
            challenge.phraseID === entry.phrase.id
          ) {
            if (didSpeak) {
              ui.session.audioPlayed = true;
            } else {
              const fallback = config.challengeModes?.find(
                (item) =>
                  item.id === (config.nonSpeakableListenFallback || "readForMeaning")
              );
              if (fallback) challenge.mode = fallback;
            }
            renderSession();
            requestAnimationFrame(() => {
              if (didSpeak) {
                document
                  .querySelector(
                    `[data-action="${action}"][data-phrase-id="${CSS.escape(
                      entry.phrase.id
                    )}"]`
                  )
                  ?.focus();
              } else {
                document.querySelector("#session-question-title")?.focus();
              }
            });
          }
        }
        break;
      }
      case "show-written-prompt": {
        const challenge = ui.session?.challenges?.[ui.session.index];
        const fallback = config.challengeModes?.find(
          (item) => item.id === (config.nonSpeakableListenFallback || "readForMeaning")
        );
        if (challenge && fallback) {
          challenge.mode = fallback;
          ui.session.audioPlayed = true;
          renderSession();
          requestAnimationFrame(() => document.querySelector("#session-question-title")?.focus());
        }
        break;
      }
      case "toggle-learned":
        toggleLearned(button.dataset.phraseId);
        break;
      case "reveal-review":
        if (ui.practice) {
          ui.practice.revealed = true;
          render();
          requestAnimationFrame(() => document.querySelector("#review-card")?.focus());
        }
        break;
      case "rate-review":
        rateReview(button.dataset.rating);
        break;
      case "restart-practice":
        ui.practice = null;
        ensurePractice();
        render();
        requestAnimationFrame(() => document.querySelector("#review-card")?.focus());
        break;
      case "open-family-form":
        openFamilyForm();
        break;
      case "save-family-word":
        saveFamilyWord();
        break;
      case "delete-family-word":
        deleteFamilyWord(button.dataset.familyId);
        break;
      case "export-backup":
        exportBackup();
        break;
      case "import-backup":
        document.querySelector("[data-import-file]")?.click();
        break;
      default:
        break;
    }
  }

  function go(section) {
    if (!NAV_ITEMS.some((item) => item.id === section)) section = "home";
    if (ui.session) {
      ui.session = null;
      document.body.classList.remove("in-session");
    }
    ui.lessonDetail = null;
    window.speechSynthesis?.cancel?.();
    ui.section = section;
    if (section !== "practice") ui.practice = null;
    const nextHash = `#${section}`;
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash;
    }
    render();
    focusMain();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function sectionFromHash(fallback = "home") {
    const value = window.location.hash.replace(/^#/, "").split("/")[0];
    if (value === "main-content") return fallback;
    return NAV_ITEMS.some((item) => item.id === value) ? value : "home";
  }

  function render() {
    if (!lessons.length) {
      main.innerHTML = `<section class="page"><div class="card empty-state"><h1>Course data could not load</h1><p>Refresh the page to try again.</p></div></section>`;
      return;
    }

    updateChrome();
    document.body.classList.toggle("in-session", Boolean(ui.session));
    if (ui.session) {
      renderSession();
      return;
    }

    switch (ui.section) {
      case "learn":
        if (ui.lessonDetail) renderLessonDetail(ui.lessonDetail);
        else renderLearn();
        break;
      case "practice":
        ensurePractice();
        renderPractice();
        break;
      case "phrasebook":
        renderPhrasebook();
        break;
      case "family":
        renderFamily();
        break;
      default:
        renderHome();
        break;
    }
  }

  function updateChrome() {
    document.querySelectorAll("[data-nav]").forEach((button) => {
      const active = button.dataset.nav === ui.section;
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    sidebarRoots.textContent = state.familyRoots.trim() || config.heritageTrack;
    headerXP.textContent = state.totalXP;
  }

  function renderHome() {
    const progress = overallProgress();
    const nextLesson = lessons.find((lesson) => lessonProgress(lesson) < 1);
    const due = dueEntries().length;
    const roots = state.familyRoots.trim() || config.heritageTrack;
    main.innerHTML = `
      <section class="page">
        <header class="page-header">
          <div class="page-title">
            <span class="eyebrow">Your Yiddish today</span>
            <h1>Sholem aleykhem</h1>
            <p>A few spoken phrases at a time—always in Latin letters.</p>
          </div>
          ${progressRing(progress)}
        </header>

        <div class="metric-grid" aria-label="Your learning progress">
          ${metric("♨", state.currentStreak, state.currentStreak === 1 ? "day" : "days", "#8c422e")}
          ${metric("★", state.totalXP, "total XP", "#a76509")}
          ${metric("◎", `${state.dailyXP}/${config.dailyGoal || 50}`, "today", "#356148")}
        </div>

        ${
          nextLesson
            ? continueCard(nextLesson)
            : `<div class="card feature-card" style="margin-bottom:22px">
                <span class="pill" style="--tone:var(--sage)">✓ First course complete</span>
                <h2>Keep the words alive</h2>
                <p>Bring them back in Practice and add the expressions your own family used.</p>
                <button class="plain-link" type="button" data-go="practice">Open practice →</button>
              </div>`
        }

        <div class="two-column">
          <article class="card feature-card">
            <div class="feature-topline">
              <span class="pill" style="--tone:var(--plum)">⌖ ${esc(roots)}</span>
              <span class="eyebrow">Heritage track</span>
            </div>
            <h2>Your family gets the last word</h2>
            <p>Broad Southeastern patterns are a starting point. Save the exact vowels, sayings, places, and memories your relatives used.</p>
            <button class="plain-link" type="button" data-go="family">Open family words →</button>
          </article>

          <article class="card feature-card">
            <div class="feature-topline">
              <span class="pill" style="--tone:var(--sage)">◆ ${due} ready</span>
              <span class="eyebrow">Recall</span>
            </div>
            <h2>${due ? "A short review is waiting" : "Build a memory worth keeping"}</h2>
            <p>${
              due
                ? "Rate each phrase Again, Good, or Easy. The next review adjusts to what you remember."
                : "Complete a lesson, then spaced review will bring each phrase back at the right time."
            }</p>
            <button class="plain-link" type="button" data-go="${due ? "practice" : "learn"}">${
              due ? "Start review" : "Choose a lesson"
            } →</button>
          </article>
        </div>

        <p class="notice"><span class="notice-icon" aria-hidden="true">ⓘ</span><span><strong>Rough audio</strong> uses your browser’s approximate voice. Progress and family words stay in this browser. You can make a backup from Family words.</span></p>
      </section>`;
  }

  function metric(icon, value, label, tone) {
    return `<div class="card metric" style="--tone:${tone}">
      <span class="metric-icon" aria-hidden="true">${icon}</span>
      <span class="metric-copy"><strong>${esc(String(value))}</strong><span>${esc(label)}</span></span>
    </div>`;
  }

  function progressRing(progress) {
    const percent = Math.round(progress * 100);
    return `<div class="progress-ring" style="--progress:${percent * 3.6}deg" role="img" aria-label="${percent} percent complete"><strong>${percent}%</strong></div>`;
  }

  function continueCard(lesson) {
    const started = lessonProgress(lesson) > 0;
    return `<button class="continue-card" type="button" data-start-lesson="${escAttr(lesson.id)}">
      <span class="lesson-glyph" aria-hidden="true">${lessonGlyph(lesson)}</span>
      <span class="continue-copy">
        <span class="eyebrow">${started ? "Continue" : "Today"} · Lesson ${lesson.number}</span>
        <h2>${esc(lesson.title)}</h2>
        <p>${esc(lesson.subtitle)}</p>
        <small>${esc(reasonForLesson(lesson))}</small>
      </span>
      <span class="continue-action"><span class="round-arrow" aria-hidden="true">→</span><small>${lesson.minutes} min</small></span>
    </button>`;
  }

  function reasonForLesson(lesson) {
    const reasons = {
      "sound-map":
        "Because you want speech without Hebrew-reading lessons, these seven Latin sound patterns are the shortest useful foundation.",
      greetings:
        "Your first goal is a real exchange you could have heard around the family table.",
      "family-table":
        "These are the people and relationships at the center of the Yiddish you want back.",
      kitchen:
        "Food words often preserve the most local Bessarabian household vocabulary.",
      "keep-talking":
        "These phrases help you ask for the exact family word instead of guessing it.",
      warmth:
        "Rhythm and feeling carry as much family identity as dictionary meaning.",
      "family-story":
        "This turns vocabulary into the memories and sayings you actually came here to recover.",
    };
    return (
      reasons[lesson.id] ||
      "This is the next short step in your personal Bessarabia–Odessa path."
    );
  }

  function renderLearn() {
    main.innerHTML = `
      <section class="page">
        <header class="page-header">
          <div class="page-title">
            <span class="eyebrow">Seven short lessons</span>
            <h1>Learn by using it</h1>
            <p>Read, listen, recall, and notice regional clues. There is no Hebrew alphabet to memorize.</p>
          </div>
        </header>
        <div class="lesson-list">
          ${lessons.map(lessonRow).join("")}
        </div>
        <p class="notice"><span class="notice-icon" aria-hidden="true">⌖</span><span>“Bessarabia–Odessa” names a family geography, not one perfectly uniform dialect. Regional notes are clues; your household form has the final say.</span></p>
      </section>`;
  }

  function lessonRow(lesson) {
    const progress = lessonProgress(lesson);
    const percent = Math.round(progress * 100);
    const tone = toneColor(lesson.tone);
    return `<button class="lesson-row" type="button" data-open-lesson="${escAttr(lesson.id)}" style="--tone:${tone}">
      <span class="lesson-number">${progress === 1 ? "✓" : lesson.number}</span>
      <span class="lesson-row-copy">
        <h2>${esc(lesson.title)}</h2>
        <p>${esc(lesson.subtitle)}</p>
      </span>
      <span class="lesson-meta">
        <span>${lesson.minutes} min · ${lesson.phrases.length} items</span>
        <span class="mini-progress" aria-label="${percent} percent complete"><span style="--width:${percent}%"></span></span>
      </span>
    </button>`;
  }

  function renderLessonDetail(lessonID) {
    const lesson = lessons.find((item) => item.id === lessonID);
    if (!lesson) {
      ui.lessonDetail = null;
      return renderLearn();
    }
    const percent = Math.round(lessonProgress(lesson) * 100);
    main.innerHTML = `<section class="page lesson-detail-page">
      <button class="text-button back-link" type="button" data-go="learn">← All lessons</button>
      <header class="lesson-detail-header" style="--tone:${toneColor(lesson.tone)}">
        <div class="lesson-number large">${lesson.number}</div>
        <div class="page-title">
          <span class="eyebrow">Lesson ${lesson.number} · ${lesson.minutes} minutes</span>
          <h1>${esc(lesson.title)}</h1>
          <p>${esc(lesson.subtitle)}</p>
        </div>
        <button class="primary-button" type="button" data-start-lesson="${escAttr(
          lesson.id
        )}">${percent ? "Practice lesson" : "Start lesson"} →</button>
      </header>
      <div class="dialect-note"><span aria-hidden="true">⌖</span><span><strong>Dialect note.</strong> ${esc(
        lesson.dialectNote
      )}</span></div>
      <div class="lesson-reference-list">
        ${lesson.phrases.map((phrase, index) => lessonReferenceCard(lesson, phrase, index)).join("")}
      </div>
      <div class="lesson-detail-footer">
        <div><strong>${percent}% complete</strong><span class="mini-progress" aria-label="${percent} percent complete"><span style="--width:${percent}%;--tone:${toneColor(
          lesson.tone
        )}"></span></span></div>
        <button class="primary-button" type="button" data-start-lesson="${escAttr(
          lesson.id
        )}">${percent ? "Practice this lesson" : "Start this lesson"}</button>
      </div>
    </section>`;
  }

  function lessonReferenceCard(lesson, phrase, index) {
    const learned = isLearned(phrase.id);
    const variants = phrase.variants?.length
      ? `<details class="reference-variants"><summary>${phrase.variants.length} regional or family variant${
          phrase.variants.length === 1 ? "" : "s"
        }</summary>${phrase.variants
          .map(
            (variant) => `<div class="variant"><strong>${esc(variant.label)} · ${esc(
              variant.transliteration
            )}</strong><span>${esc(variant.pronunciation)}</span><small>${esc(
              variant.note
            )}</small></div>`
          )
          .join("")}</details>`
      : "";
    return `<article class="card lesson-reference-card">
      <div class="reference-index" aria-hidden="true">${index + 1}</div>
      <div class="reference-copy">
        <div class="phrase-title-line"><h2>${esc(phrase.transliteration)}</h2><span class="lesson-chip" style="--tone:${toneColor(
          lesson.tone
        )}">L${lesson.number}</span></div>
        <p class="reference-meaning">${esc(phrase.meaning)}</p>
        <p class="reference-sound">Say it like: ${esc(phrase.pronunciation)}</p>
        <p class="reference-usage">${esc(phrase.usage)}</p>
        ${variants}
      </div>
      <div class="reference-actions">
        ${audioControls(phrase, true)}
        <button class="learn-button ${learned ? "learned" : ""}" type="button" data-action="toggle-learned" data-phrase-id="${escAttr(
          phrase.id
        )}" aria-label="${learned ? "Remove from learned phrases" : "Mark phrase learned"}" aria-pressed="${learned}">${
          learned ? "✓ Learned" : "+ Learn"
        }</button>
      </div>
    </article>`;
  }

  function startLesson(lessonID) {
    const lesson = lessons.find((item) => item.id === lessonID);
    if (!lesson) return;
    ui.session = {
      lessonID,
      challenges: buildChallenges(lesson),
      index: 0,
      selected: null,
      checked: false,
      audioPlayed: false,
      correct: false,
      missed: [],
      xpEarned: 0,
      complete: false,
      feedback: "",
    };
    document.body.classList.add("in-session");
    renderSession();
    window.scrollTo({ top: 0 });
    focusMain();
  }

  function buildChallenges(lesson) {
    const modeCycle = config.challengeModeCycle || [
      "readForMeaning",
      "listenForMeaning",
      "recallYiddish",
    ];
    const modes = config.challengeModes || [];
    const speechAvailable = "speechSynthesis" in window;
    return lesson.phrases.map((phrase, index) => {
      let modeID = modeCycle[index % modeCycle.length];
      if (modeID === "listenForMeaning" && (!phrase.canSpeak || !speechAvailable)) {
        modeID = config.nonSpeakableListenFallback || "readForMeaning";
      }
      const mode = modes.find((item) => item.id === modeID) || {
        id: "readForMeaning",
        label: "READ · YIDDISH → ENGLISH",
        prompt: "What does this phrase mean?",
        promptField: "transliteration",
        answerField: "meaning",
        requiresAudio: false,
      };
      const lessonPool = uniqueBy(lesson.phrases, (item) => item[mode.answerField]);
      const pool =
        lessonPool.length >= (config.answerChoiceCount || 4)
          ? lessonPool
          : uniqueBy(
              [...lessonPool, ...shuffle(coreEntries.map((entry) => entry.phrase))],
              (item) => item[mode.answerField]
            );
      const distractors = shuffle(
        pool.filter((item) => item.id !== phrase.id).map((item) => item[mode.answerField])
      ).slice(0, Math.max(0, (config.answerChoiceCount || 4) - 1));
      return {
        phraseID: phrase.id,
        mode,
        correctAnswer: phrase[mode.answerField],
        options: shuffle([phrase[mode.answerField], ...distractors]),
      };
    });
  }

  function renderSession() {
    const session = ui.session;
    if (!session) return render();
    const lesson = lessons.find((item) => item.id === session.lessonID);
    if (!lesson) return;
    document.body.classList.add("in-session");

    if (session.complete) {
      const correctCount = session.challenges.length - session.missed.length;
      const accuracy = Math.round((correctCount / session.challenges.length) * 100);
      main.innerHTML = `<section class="session-page">
        <div class="card completion-card">
          <div class="completion-badge" aria-hidden="true">✓</div>
          <span class="eyebrow">Lesson ${lesson.number} complete</span>
          <h1>${esc(lesson.title)}</h1>
          <p>You practiced ${lesson.phrases.length} pieces of living Yiddish with <strong>${accuracy}% accuracy</strong> and earned <strong>${session.xpEarned} XP</strong>. Missed phrases are already waiting in Practice.</p>
          <div class="completion-actions">
            <button class="primary-button" type="button" data-action="exit-session">Back to course</button>
            <button class="secondary-button" type="button" data-go="practice">Review now</button>
          </div>
        </div>
      </section>`;
      focusMain();
      return;
    }

    const challenge = session.challenges[session.index];
    const phrase = lesson.phrases.find((item) => item.id === challenge.phraseID);
    const progress = ((session.index + (session.checked ? 1 : 0)) / session.challenges.length) * 100;
    const isListening = challenge.mode.id === "listenForMeaning";
    const prompt = isListening
      ? `<div class="prompt-card card listen-prompt">
          <span class="prompt-kicker">Rough audio · browser voice</span>
          <button class="big-listen" type="button" data-action="play" data-phrase-id="${escAttr(phrase.id)}" aria-label="Play rough audio">▶</button>
          <button class="text-button" type="button" data-action="play-slow" data-phrase-id="${escAttr(phrase.id)}">Play slowly</button>
          <button class="text-button" type="button" data-action="show-written-prompt">Can’t hear it? Show the phrase</button>
        </div>`
      : `<div class="prompt-card card">
          <span class="prompt-kicker">${esc(challenge.mode.label)}</span>
          <h2 class="prompt-main">${esc(phrase[challenge.mode.promptField])}</h2>
          ${
            challenge.mode.id === "readForMeaning"
              ? `<p class="prompt-sub">${esc(phrase.pronunciation)}</p>`
              : ""
          }
        </div>`;

    main.innerHTML = `<section class="session-page">
      <header class="session-header">
        <button class="icon-button" type="button" data-action="exit-session" aria-label="Leave lesson">×</button>
        <div class="session-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(progress)}"><span style="--width:${progress}%"></span></div>
        <div class="xp-chip" aria-label="Experience earned this lesson">+${session.xpEarned} XP</div>
      </header>

      <div class="question-wrap">
        <div class="question-intro">
          <span class="eyebrow">${esc(challenge.mode.label)}</span>
          <h1 id="session-question-title" tabindex="-1">${esc(challenge.mode.prompt)}</h1>
          <p>${session.index + 1} of ${session.challenges.length} · Lesson ${lesson.number}</p>
        </div>

        ${prompt}

        <div class="option-grid" role="group" aria-label="Answer choices">
          ${challenge.options
            .map((option, index) => optionButton(option, index, challenge))
            .join("")}
        </div>

        ${session.index === 0 && !session.checked ? `<div class="dialect-note"><span aria-hidden="true">⌖</span><span>${esc(lesson.dialectNote)}</span></div>` : ""}
        ${answerBar(phrase)}
      </div>
    </section>`;
  }

  function optionButton(option, index, challenge) {
    const selected = ui.session.selected === index;
    const isCorrectOption = option === challenge.correctAnswer;
    const audioLocked = challenge.mode.id === "listenForMeaning" && !ui.session.audioPlayed;
    let classes = "option";
    if (selected) classes += " selected";
    if (ui.session.checked && isCorrectOption) classes += " correct";
    if (ui.session.checked && selected && !isCorrectOption) classes += " wrong";
    return `<button class="${classes}" type="button" data-option-index="${index}" ${
      ui.session.checked || audioLocked ? "disabled" : ""
    } aria-pressed="${selected}">${esc(option)}</button>`;
  }

  function answerBar(phrase) {
    const session = ui.session;
    if (!session.checked) {
      const challenge = session.challenges[session.index];
      const audioLocked = challenge.mode.id === "listenForMeaning" && !session.audioPlayed;
      return `<div class="answer-bar" aria-live="polite">
        <div class="answer-copy"><strong>${
          audioLocked ? "Play the rough audio first" : "Choose one answer"
        }</strong><span>${
          audioLocked ? "The choices will unlock after you listen." : "You can change it before checking."
        }</span></div>
        <button class="primary-button" type="button" data-action="check-answer" ${
          session.selected === null || audioLocked ? "disabled" : ""
        }>Check answer</button>
      </div>`;
    }

    const variants = phrase.variants?.length
      ? `<div class="variant-list">${phrase.variants
          .map(
            (variant) => `<div class="variant"><strong>${esc(variant.label)}: ${esc(
              variant.transliteration
            )}</strong><span>${esc(variant.pronunciation)}</span><small>${esc(
              variant.note
            )}</small></div>`
          )
          .join("")}</div>`
      : "";
    return `<div id="answer-feedback" tabindex="-1">
      <div class="answer-bar ${session.correct ? "good" : "bad"}" aria-live="polite">
        <div class="answer-copy">
          <strong>${session.correct ? "Nice—keep that sound." : "Almost. This one will come back soon."}</strong>
          <span><b>${esc(phrase.transliteration)}</b> · ${esc(phrase.meaning)} · ${esc(
            phrase.pronunciation
          )}<br>${esc(phrase.usage)}</span>
        </div>
        <button class="primary-button" type="button" data-action="continue-question">${
          session.index === session.challenges.length - 1 ? "Finish lesson" : "Continue"
        }</button>
      </div>
      ${variants}
    </div>`;
  }

  function checkAnswer() {
    const session = ui.session;
    if (!session || session.checked || session.selected === null) return;
    const challenge = session.challenges[session.index];
    const chosen = challenge.options[session.selected];
    session.correct = chosen === challenge.correctAnswer;
    session.checked = true;
    if (session.correct) {
      const points = config.pointsPerCorrectAnswer || 10;
      session.xpEarned += points;
      awardXP(points);
    } else if (!session.missed.includes(challenge.phraseID)) {
      session.missed.push(challenge.phraseID);
    }
    saveState();
    renderSession();
    requestAnimationFrame(() => document.querySelector("#answer-feedback")?.focus());
  }

  function continueQuestion() {
    const session = ui.session;
    if (!session || !session.checked) return;
    if (session.index < session.challenges.length - 1) {
      session.index += 1;
      session.selected = null;
      session.checked = false;
      session.audioPlayed = false;
      session.correct = false;
      renderSession();
      window.scrollTo({ top: 0, behavior: "smooth" });
      requestAnimationFrame(() => document.querySelector("#session-question-title")?.focus());
      return;
    }

    const lesson = lessons.find((item) => item.id === session.lessonID);
    completeLesson(lesson, session.missed);
    const bonus = config.lessonCompletionBonus || 20;
    awardXP(bonus);
    session.xpEarned += bonus;
    session.complete = true;
    saveState();
    renderSession();
  }

  function completeLesson(lesson, missedIDs) {
    const missed = new Set(missedIDs);
    const tomorrow = Date.now() + 24 * 60 * 60 * 1000;
    lesson.phrases.forEach((phrase) => {
      learnID(phrase.id);
      if (missed.has(phrase.id)) {
        state.reviewStates[phrase.id] = { level: 0, dueAt: new Date().toISOString() };
      } else if (!state.reviewStates[phrase.id]) {
        state.reviewStates[phrase.id] = { level: 1, dueAt: new Date(tomorrow).toISOString() };
      }
    });
  }

  function ensurePractice() {
    if (ui.practice) return;
    const learned = practiceEntries().filter((entry) => isLearned(entry.phrase.id));
    const due = dueEntries();
    const source = due.length ? due : learned;
    ui.practice = {
      queue: shuffle(source).slice(0, config.reviewSessionSize || 8).map((entry) => entry.phrase.id),
      index: 0,
      revealed: false,
      complete: false,
    };
  }

  function renderPractice() {
    const practice = ui.practice;
    const learnedCount = practiceEntries().filter((entry) => isLearned(entry.phrase.id)).length;
    if (!learnedCount) {
      main.innerHTML = `<section class="page">
        ${pageHeading("Practice", "Spaced recall", "A few remembered phrases at a time.")}
        <div class="card empty-state">
          <div class="empty-icon" aria-hidden="true">◆</div>
          <h2>Learn a phrase first</h2>
          <p>Complete a lesson or mark a phrase in the Phrasebook. It will appear here for spaced review.</p>
          <button class="primary-button" type="button" data-go="learn">Choose a lesson</button>
        </div>
      </section>`;
      return;
    }

    if (!practice.queue.length || practice.complete) {
      main.innerHTML = `<section class="page">
        ${pageHeading("Practice", "Session complete", "Small acts of recall are what make the words stick.")}
        <div class="card completion-card">
          <div class="completion-badge" aria-hidden="true">◆</div>
          <h1 id="practice-complete-title" tabindex="-1">Review complete</h1>
          <p>You brought ${practice.queue.length || learnedCount} phrases back to mind. Come back when they are due, or take another round now.</p>
          <div class="completion-actions"><button class="primary-button" type="button" data-action="restart-practice">Practice another round</button><button class="secondary-button" type="button" data-go="home">Go home</button></div>
        </div>
      </section>`;
      return;
    }

    const phraseID = practice.queue[practice.index];
    const entry = findEntry(phraseID);
    if (!entry) {
      practice.index += 1;
      if (practice.index >= practice.queue.length) practice.complete = true;
      return renderPractice();
    }
    const phrase = entry.phrase;
    main.innerHTML = `<section class="page">
      ${pageHeading("Practice", "Spaced recall", "Try to say it before you reveal the card.")}
      <div class="review-shell">
        <div class="review-counter">CARD ${practice.index + 1} OF ${practice.queue.length}</div>
        <div class="card flashcard" id="review-card" tabindex="-1" aria-live="polite">
          <span class="eyebrow">What does this mean?</span>
          ${
            practice.revealed
              ? `<h2>${esc(phrase.transliteration)}</h2><p class="meaning">${esc(
                  phrase.meaning
                )}</p><p class="pronunciation">${esc(
                  phrase.pronunciation
                )}</p><p class="usage">${esc(phrase.usage)}</p>${audioControls(phrase)}`
              : `<h2>${esc(
                  phrase.transliteration
                )}</h2><p class="pronunciation">${esc(
                  phrase.pronunciation
                )}</p><p class="meaning">Say it aloud, recall the meaning, then reveal it.</p>`
          }
        </div>
        ${
          practice.revealed
            ? `<div class="rating-grid">
                ${ratingButton("Again", "10 min", "again", "#8b2335")}
                ${ratingButton("Good", "later", "good", "#315843")}
                ${ratingButton("Easy", "longer", "easy", "#386791")}
              </div>`
            : `<button class="primary-button reveal-button" type="button" data-action="reveal-review">Reveal answer</button>`
        }
      </div>
    </section>`;
  }

  function ratingButton(label, timing, rating, tone) {
    return `<button class="rating-button" type="button" data-action="rate-review" data-rating="${rating}" style="--tone:${tone}"><span>${label}</span><small>${timing}</small></button>`;
  }

  function rateReview(rating) {
    const practice = ui.practice;
    if (!practice || practice.complete) return;
    const phraseID = practice.queue[practice.index];
    const current = state.reviewStates[phraseID] || { level: 0, dueAt: new Date().toISOString() };
    let level = safeNumber(current.level);
    let dueAt;
    if (rating === "again") {
      level = 0;
      dueAt = Date.now() + 10 * 60 * 1000;
    } else {
      level = Math.min(level + (rating === "easy" ? 2 : 1), 5);
      const intervals = config.reviewIntervalsInDays || [0, 1, 3, 7, 14, 30];
      dueAt = Date.now() + intervals[level] * 24 * 60 * 60 * 1000;
    }
    learnID(phraseID);
    state.reviewStates[phraseID] = { level, dueAt: new Date(dueAt).toISOString() };
    const points = config.reviewRatingXP?.[rating] || (rating === "easy" ? 5 : rating === "good" ? 3 : 1);
    awardXP(points);
    practice.index += 1;
    practice.revealed = false;
    if (practice.index >= practice.queue.length) practice.complete = true;
    saveState();
    render();
    requestAnimationFrame(() =>
      document.querySelector("#review-card, #practice-complete-title")?.focus()
    );
  }

  function renderPhrasebook() {
    main.innerHTML = `<section class="page">
      <header class="page-header">
        <div class="page-title"><span class="eyebrow">Latin letters only</span><h1>Phrasebook</h1><p>Search in English or Yiddish transliteration.</p></div>
        <label class="search-wrap"><span class="sr-only">Search the phrasebook</span><input class="search-input" type="search" data-phrase-search placeholder="water, goodbye, vaser…" value="${escAttr(
          ui.phraseQuery
        )}"></label>
      </header>
      <div class="phrase-list" id="phrase-results"></div>
    </section>`;
    renderPhraseResults();
  }

  function renderPhraseResults() {
    const container = document.querySelector("#phrase-results");
    if (!container) return;
    const query = normalizeSearch(ui.phraseQuery);
    const results = coreEntries.filter(({ phrase }) => {
      if (!query) return true;
      return normalizeSearch(
        `${phrase.transliteration} ${phrase.meaning} ${phrase.pronunciation}`
      ).includes(query);
    });
    container.innerHTML = results.length
      ? results.map(phraseRow).join("")
      : `<div class="card empty-state"><div class="empty-icon" aria-hidden="true">⌕</div><h2>No phrase matches “${esc(
          ui.phraseQuery
        )}”</h2><p>Try an English meaning or a Latin-letter Yiddish word.</p></div>`;
  }

  function phraseRow({ lesson, phrase }) {
    const learned = isLearned(phrase.id);
    return `<article class="card phrase-row">
      <div class="phrase-copy">
        <div class="phrase-title-line"><strong>${esc(
          phrase.transliteration
        )}</strong><span class="lesson-chip" style="--tone:${toneColor(
          lesson.tone
        )}">L${lesson.number}</span></div>
        <span class="phrase-meaning">${esc(phrase.meaning)}</span>
        <span class="phrase-pronunciation">${esc(phrase.pronunciation)}</span>
      </div>
      <div class="phrase-actions">
        ${audioControls(phrase, true)}
        <button class="learn-button ${learned ? "learned" : ""}" type="button" data-action="toggle-learned" data-phrase-id="${escAttr(
          phrase.id
        )}" aria-label="${learned ? "Remove from learned phrases" : "Mark phrase learned"}" aria-pressed="${learned}">${
          learned ? "✓" : "+"
        }</button>
      </div>
    </article>`;
  }

  function audioControls(phrase, compact = false) {
    if (!phrase.canSpeak) return "";
    return `<span class="phrase-actions" aria-label="Rough audio controls">
      <button class="audio-button" type="button" data-action="play" data-phrase-id="${escAttr(
        phrase.id
      )}" aria-label="Play rough audio for ${escAttr(phrase.transliteration)}">${
        compact ? "▶" : "▶ Play"
      }</button>
      <button class="audio-button" type="button" data-action="play-slow" data-phrase-id="${escAttr(
        phrase.id
      )}" aria-label="Play rough audio slowly for ${escAttr(
        phrase.transliteration
      )}">${compact ? "Slow" : "Slow"}</button>
    </span>`;
  }

  function toggleLearned(phraseID) {
    let message;
    if (isLearned(phraseID)) {
      state.learnedPhraseIDs = state.learnedPhraseIDs.filter((id) => id !== phraseID);
      delete state.reviewStates[phraseID];
      message = "Removed from your review deck.";
    } else {
      learnID(phraseID);
      state.reviewStates[phraseID] = { level: 0, dueAt: new Date().toISOString() };
      message = "Added to your review deck.";
    }
    const persisted = saveState();
    render();
    requestAnimationFrame(() =>
      document
        .querySelector(`[data-action="toggle-learned"][data-phrase-id="${CSS.escape(phraseID)}"]`)
        ?.focus()
    );
    if (persisted) showToast(message);
  }

  function renderFamily() {
    const roots = state.familyRoots || "";
    main.innerHTML = `<section class="page">
      <header class="page-header">
        <div class="page-title"><span class="eyebrow">Your living dictionary</span><h1>Family words</h1><p>Save a word exactly as your family said it. The course will never “correct” an inherited form.</p></div>
        <button class="primary-button" type="button" data-action="open-family-form">＋ Add word</button>
      </header>

      <div class="family-layout">
        <div class="card roots-card">
          <label for="family-roots">⌖ Family roots</label>
          <input class="text-input" id="family-roots" data-family-roots value="${escAttr(
            roots
          )}" placeholder="Town, district, or route">
          <p>Start broad, then add exact places as you discover them: a town, Kishinev/Chișinău, Odessa, or a migration route.</p>
        </div>

        ${
          state.familyPhrases.length
            ? `<div class="family-list">${state.familyPhrases.map(familyRow).join("")}</div>`
            : `<div class="card empty-state"><div class="empty-icon" aria-hidden="true">♥</div><h2>Start with one remembered word</h2><p>Maybe a nickname, a food, a scolding, or the way your grandparents said bobe. Write it the way it sounded to you.</p><button class="secondary-button" type="button" data-action="open-family-form">Add the first word</button></div>`
        }

        <article class="card feature-card">
          <div class="feature-topline"><span class="pill" style="--tone:var(--blue)">Saved on this device</span><span class="eyebrow">Private backup</span></div>
          <h2>Keep your family notes safe</h2>
          <p>This site has no account or server. Export a small backup file before clearing browser data or moving to another device.</p>
          <div class="completion-actions" style="justify-content:flex-start">
            <button class="secondary-button" type="button" data-action="export-backup">Export backup</button>
            <button class="secondary-button" type="button" data-action="import-backup">Import backup</button>
            <input class="sr-only" type="file" accept="application/json,.json" data-import-file>
          </div>
        </article>
      </div>
    </section>`;
  }

  function familyRow(item) {
    return `<article class="card family-row" tabindex="-1" data-family-row="${escAttr(item.id)}">
      <span class="quote-glyph" aria-hidden="true">“</span>
      <div class="family-copy">
        <h2>${esc(item.transliteration)}</h2>
        <p>${esc(item.meaning)}</p>
        ${item.pronunciation ? `<p class="sound">Sounds like: ${esc(item.pronunciation)}</p>` : ""}
        ${item.memory ? `<p>${esc(item.memory)}</p>` : ""}
        ${item.place ? `<span class="place">⌖ ${esc(item.place)}</span>` : ""}
      </div>
      <button class="icon-button" type="button" data-action="delete-family-word" data-family-id="${escAttr(
        item.id
      )}" aria-label="Delete ${escAttr(item.transliteration)}">×</button>
    </article>`;
  }

  function openFamilyForm() {
    ui.modal = "family";
    ui.lastFocused = document.activeElement;
    modalRoot.innerHTML = `<div class="modal-backdrop" role="presentation">
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="family-form-title">
        <header class="modal-header"><div><span class="eyebrow">Your family has the authority</span><h2 id="family-form-title">Add a family word</h2></div><button class="icon-button" type="button" data-action="close-modal" aria-label="Close">×</button></header>
        <div class="modal-body">
          <form class="form-grid" id="family-form" novalidate>
            <div class="field"><label for="family-word">Word or phrase *</label><input class="text-input" id="family-word" name="transliteration" autocomplete="off" placeholder="Write it as it sounded" required></div>
            <div class="field"><label for="family-meaning">What did it mean? *</label><input class="text-input" id="family-meaning" name="meaning" autocomplete="off" required></div>
            <div class="field"><label for="family-sound">Break down the pronunciation</label><input class="text-input" id="family-sound" name="pronunciation" autocomplete="off" placeholder="BUH-beh"></div>
            <div class="field"><label for="family-memory">The memory</label><textarea class="text-area" id="family-memory" name="memory" placeholder="Who said it, and when?"></textarea></div>
            <div class="field"><label for="family-place">Town or region</label><input class="text-input" id="family-place" name="place" value="${escAttr(
              state.familyRoots
            )}"></div>
            <small>Use Latin letters however they make sense to you. You can normalize the spelling later without losing the family version.</small>
            <div class="form-actions"><button class="secondary-button" type="button" data-action="close-modal">Cancel</button><button class="primary-button" type="submit">Save word</button></div>
          </form>
        </div>
      </section>
    </div>`;
    appShell.inert = true;
    document.body.classList.add("modal-open");
    requestAnimationFrame(() => document.querySelector("#family-word")?.focus());
  }

  function saveFamilyWord() {
    const form = document.querySelector("#family-form");
    if (!form) return;
    const data = new FormData(form);
    const transliteration = String(data.get("transliteration") || "").trim();
    const meaning = String(data.get("meaning") || "").trim();
    if (!transliteration || !meaning) {
      showToast("Add the word and what it meant first.");
      (!transliteration
        ? document.querySelector("#family-word")
        : document.querySelector("#family-meaning"))?.focus();
      return;
    }
    const item = {
      id: makeID(),
      transliteration,
      meaning,
      pronunciation: String(data.get("pronunciation") || "").trim(),
      memory: String(data.get("memory") || "").trim(),
      place: String(data.get("place") || "").trim(),
      createdAt: new Date().toISOString(),
    };
    state.familyPhrases.unshift(item);
    const phraseID = `family-${item.id}`;
    learnID(phraseID);
    state.reviewStates[phraseID] = { level: 0, dueAt: new Date().toISOString() };
    const persisted = saveState();
    closeModal();
    render();
    requestAnimationFrame(() =>
      document.querySelector(`[data-family-row="${CSS.escape(item.id)}"]`)?.focus()
    );
    showToast(
      persisted
        ? "Saved to Family words and added to Practice."
        : "Saved for this visit, but browser storage is unavailable. Export a backup before leaving."
    );
  }

  function deleteFamilyWord(id) {
    const item = state.familyPhrases.find((entry) => entry.id === id);
    if (!item) return;
    if (!window.confirm(`Delete “${item.transliteration}” from Family words?`)) return;
    state.familyPhrases = state.familyPhrases.filter((entry) => entry.id !== id);
    const phraseID = `family-${id}`;
    state.learnedPhraseIDs = state.learnedPhraseIDs.filter((entry) => entry !== phraseID);
    delete state.reviewStates[phraseID];
    const persisted = saveState();
    render();
    focusMain();
    if (persisted) showToast("Family word deleted.");
  }

  function openWelcome() {
    ui.modal = "welcome";
    ui.lastFocused = document.activeElement;
    modalRoot.innerHTML = `<div class="modal-backdrop">
      <section class="modal welcome-modal" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
        <div class="welcome-body">
          <div class="welcome-logo"><img src="assets/icon-192.png" alt=""><div><strong>Mameloshn</strong><br><small>Yiddish in your family’s voice</small></div></div>
          <div class="welcome-hero"><h1 id="welcome-title">Learn the Yiddish your family remembers.</h1><p>A speaking-first course for family roots from Bessarabia to Odessa, written entirely in Latin letters.</p></div>
          <div class="welcome-features">
            ${welcomeFeature("Aa", "No Hebrew alphabet", "Read a consistent Latin transliteration and an easy sound guide.")}
            ${welcomeFeature("⌖", "Bessarabia–Odessa aware", "Compare a stable reference form with broad Southeastern family pronunciation.")}
            ${welcomeFeature("♥", "Your family gets the last word", "Save the exact words, vowels, places, and memories your relatives used.")}
          </div>
          <button class="primary-button welcome-cta" type="button" data-action="finish-welcome">Start with the sounds →</button>
        </div>
      </section>
    </div>`;
    appShell.inert = true;
    document.body.classList.add("modal-open");
    requestAnimationFrame(() => document.querySelector("[data-action='finish-welcome']")?.focus());
  }

  function welcomeFeature(icon, title, detail) {
    return `<div class="welcome-feature"><span class="feature-icon" aria-hidden="true">${icon}</span><div><strong>${esc(
      title
    )}</strong><p>${esc(detail)}</p></div></div>`;
  }

  function closeModal() {
    ui.modal = null;
    modalRoot.innerHTML = "";
    appShell.inert = false;
    document.body.classList.remove("modal-open");
    if (ui.lastFocused && typeof ui.lastFocused.focus === "function") ui.lastFocused.focus();
    ui.lastFocused = null;
  }

  function trapModalFocus(event) {
    const modal = modalRoot.querySelector("[role='dialog']");
    if (!modal) return;
    const focusable = [...modal.querySelectorAll(
      "button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])"
    )].filter((item) => !item.hidden && item.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function pageHeading(title, eyebrow, subtitle) {
    return `<header class="page-header"><div class="page-title"><span class="eyebrow">${esc(
      eyebrow
    )}</span><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div></header>`;
  }

  function practiceEntries() {
    return [
      ...coreEntries,
      ...state.familyPhrases.map((item) => ({ lesson: null, phrase: familyPracticePhrase(item) })),
    ];
  }

  function familyPracticePhrase(item) {
    return {
      id: `family-${item.id}`,
      transliteration: item.transliteration,
      meaning: item.meaning,
      pronunciation: item.pronunciation || item.transliteration,
      speechCue: item.pronunciation || item.transliteration,
      usage: item.memory || "A word from your own family.",
      variants: [],
      canSpeak: true,
    };
  }

  function findEntry(phraseID) {
    return practiceEntries().find((entry) => entry.phrase.id === phraseID) || null;
  }

  function isLearned(phraseID) {
    return state.learnedPhraseIDs.includes(phraseID);
  }

  function learnID(phraseID) {
    if (!isLearned(phraseID)) state.learnedPhraseIDs.push(phraseID);
  }

  function lessonProgress(lesson) {
    if (!lesson.phrases.length) return 0;
    const learned = lesson.phrases.filter((phrase) => isLearned(phrase.id)).length;
    return learned / lesson.phrases.length;
  }

  function overallProgress() {
    if (!coreEntries.length) return 0;
    const learned = coreEntries.filter(({ phrase }) => isLearned(phrase.id)).length;
    return learned / coreEntries.length;
  }

  function dueEntries() {
    const now = Date.now();
    return practiceEntries().filter(({ phrase }) => {
      if (!isLearned(phrase.id)) return false;
      const due = Date.parse(state.reviewStates[phrase.id]?.dueAt || "");
      return !Number.isFinite(due) || due <= now;
    });
  }

  function awardXP(amount) {
    amount = safeNumber(amount);
    if (!amount) return;
    const today = dateKey(new Date());
    const previous = state.lastActiveDay ? dateKey(new Date(state.lastActiveDay)) : null;
    if (previous === today) {
      state.dailyXP += amount;
    } else {
      state.currentStreak = previous && dayDifference(previous, today) === 1 ? state.currentStreak + 1 : 1;
      state.dailyXP = amount;
    }
    state.totalXP += amount;
    state.lastActiveDay = new Date().toISOString();
  }

  function resetDailyXPIfNeeded() {
    if (state.lastActiveDay && dateKey(new Date(state.lastActiveDay)) !== dateKey(new Date())) {
      const gap = dayDifference(dateKey(new Date(state.lastActiveDay)), dateKey(new Date()));
      state.dailyXP = 0;
      if (gap > 1) state.currentStreak = 0;
      saveState();
    }
  }

  function dateKey(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function dayDifference(fromKey, toKey) {
    const from = Date.parse(`${fromKey}T12:00:00Z`);
    const to = Date.parse(`${toKey}T12:00:00Z`);
    return Math.round((to - from) / (24 * 60 * 60 * 1000));
  }

  function loadSpeechVoices() {
    if (!("speechSynthesis" in window)) return;
    const refresh = () => {
      voices = window.speechSynthesis.getVoices();
    };
    refresh();
    window.speechSynthesis.addEventListener?.("voiceschanged", refresh);
  }

  function speak(phrase, slowly = false) {
    if (!("speechSynthesis" in window) || !phrase?.canSpeak) {
      showToast("Rough audio is not available in this browser.");
      return false;
    }
    try {
      const currentVoices = window.speechSynthesis.getVoices();
      if (currentVoices.length) voices = currentVoices;
      const voice =
        voices.find((item) => item.lang === "en-US" && item.localService === true) ||
        voices.find((item) => item.lang?.startsWith("en") && item.localService === true);
      if (!voice) {
        showToast("No local browser voice is available. Use the written sound guide instead.");
        return false;
      }
      const utterance = new SpeechSynthesisUtterance(
        phrase.speechCue || phrase.pronunciation || phrase.transliteration
      );
      utterance.voice = voice;
      utterance.lang = "en-US";
      utterance.rate = slowly ? 0.32 : 0.43;
      utterance.pitch = 0.96;
      utterance.onerror = () => showToast("Your browser could not play that rough audio.");
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
      return true;
    } catch (_error) {
      showToast("Your browser could not play that rough audio.");
      return false;
    }
  }

  function exportBackup() {
    const payload = {
      app: "Mameloshn",
      format: 1,
      exportedAt: new Date().toISOString(),
      state,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `mameloshn-backup-${dateKey(new Date())}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    showToast("Backup downloaded.");
  }

  async function importBackup(file) {
    if (!file) return;
    let storageFailure = false;
    try {
      const parsed = JSON.parse(await file.text());
      if (
        parsed?.app !== "Mameloshn" ||
        parsed?.format !== 1 ||
        !parsed.state ||
        typeof parsed.state !== "object" ||
        !Array.isArray(parsed.state.learnedPhraseIDs) ||
        !Array.isArray(parsed.state.familyPhrases) ||
        !parsed.state.reviewStates ||
        typeof parsed.state.reviewStates !== "object"
      ) {
        throw new Error("Invalid backup");
      }
      const candidate = parsed.state;
      const imported = normalizeState(candidate);
      imported.hasSeenWelcome = true;
      const hasCurrentData = state.learnedPhraseIDs.length || state.familyPhrases.length;
      if (
        hasCurrentData &&
        !window.confirm(
          "Replace the progress and family words currently saved in this browser with this backup?"
        )
      ) {
        showToast("Import canceled. Your current course is unchanged.");
        return;
      }
      const previous = state;
      state = imported;
      if (!saveState()) {
        state = previous;
        storageFailure = true;
        throw new Error("Storage unavailable");
      }
      ui.practice = null;
      render();
      showToast("Backup imported on this device.");
    } catch (_error) {
      showToast(
        storageFailure
          ? "Browser storage is unavailable, so your current course was left unchanged."
          : "That file is not a Mameloshn backup. Your current course was left unchanged."
      );
    }
  }

  function lessonGlyph(lesson) {
    const glyphs = ["≈", "◌", "♥", "⌑", "☕", "✦", "“"];
    return glyphs[(lesson.number - 1) % glyphs.length];
  }

  function toneColor(tone) {
    return TONE_COLORS[tone] || TONE_COLORS.plum;
  }

  function normalizeSearch(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase();
  }

  function uniqueBy(items, key) {
    const seen = new Set();
    return items.filter((item) => {
      const value = key(item);
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    });
  }

  function shuffle(items) {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const random = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[random]] = [copy[random], copy[index]];
    }
    return copy;
  }

  function makeID() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `word-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    toastRegion.appendChild(toast);
    window.setTimeout(() => toast.remove(), 2800);
  }

  function focusMain() {
    requestAnimationFrame(() => main.focus({ preventScroll: true }));
  }

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escAttr(value) {
    return esc(value).replace(/`/g, "&#96;");
  }
})();
