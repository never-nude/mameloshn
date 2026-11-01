(() => {
  "use strict";

  const lessons = Array.isArray(window.MAMELOSHN_LESSONS)
    ? window.MAMELOSHN_LESSONS
    : [];
  const conversations = Array.isArray(window.MAMELOSHN_CONVERSATIONS)
    ? window.MAMELOSHN_CONVERSATIONS
    : [];
  const config = window.MAMELOSHN_COURSE_CONFIG || {};
  const STORAGE_KEY = "mameloshn.learning-state.v1";
  const NAV_ITEMS = [
    { id: "home", label: "Home", icon: "⌂" },
    { id: "talk", label: "Zog mir", shortLabel: "Talk", icon: "◖" },
    { id: "learn", label: "Learn", icon: "▤" },
    { id: "practice", label: "Practice", icon: "◆" },
    { id: "phrasebook", label: "Phrasebook", icon: "≡" },
    { id: "family", label: "Family words", shortLabel: "Family", icon: "♥" },
  ];
  const BOTTOM_NAV_ITEMS = NAV_ITEMS.filter((item) => item.id !== "phrasebook");
  const TONE_COLORS = {
    plum: "#53284d",
    beet: "#9e2536",
    honey: "#a76509",
    sage: "#356148",
    blue: "#386791",
    clay: "#8c422e",
  };
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");

  const main = document.querySelector("#main-content");
  const appShell = document.querySelector("#app-shell");
  const sideNav = document.querySelector("#side-nav");
  const bottomNav = document.querySelector("#bottom-nav");
  const modalRoot = document.querySelector("#modal-root");
  const toastRegion = document.querySelector("#toast-region");
  const storageWarning = document.querySelector("#storage-warning");
  const sidebarRoots = document.querySelector("#sidebar-roots");

  let storageAvailable = true;
  let storageWarningShown = false;
  let unreadableSave = false;
  let state = loadState();
  let ui = {
    section: sectionFromHash(),
    session: null,
    practice: null,
    phraseQuery: "",
    lessonDetail: null,
    conversation: null,
    modal: null,
    lastFocused: null,
  };
  let activeAudio = null;
  let activePlaybackAbort = null;
  let mediaToken = 0;
  let conversationSequenceToken = 0;
  let mediaRecorder = null;
  let mediaStream = null;
  let recordingChunks = [];
  let recordingRequestToken = 0;

  const coreEntries = lessons.flatMap((lesson) =>
    lesson.phrases.map((phrase) => ({ lesson, phrase }))
  );

  if (!storageAvailable) storageWarning.hidden = false;
  buildNavigation();
  bindEvents();
  render();
  if (unreadableSave) showToast("Saved progress could not be read. A copy was kept in browser storage.");
  const initialConversationID = conversationIDFromHash();
  if (initialConversationID) openConversation(initialConversationID, false);

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
    };
  }

  function loadState() {
    let raw = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (_error) {
      storageAvailable = false;
      return defaultState();
    }
    if (!raw) return defaultState();
    try {
      return normalizeState(JSON.parse(raw));
    } catch (_error) {
      try {
        localStorage.setItem(`${STORAGE_KEY}.unreadable`, raw);
      } catch (_ignored) {}
      unreadableSave = true;
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

  function buildNavigation() {
    const markup = NAV_ITEMS.map(
      (item) => `
        <button class="nav-button" type="button" data-go="${item.id}" data-nav="${item.id}">
          <span class="nav-icon" aria-hidden="true">${item.icon}</span>
          <span>${esc(item.label)}</span>
        </button>`
    ).join("");
    sideNav.innerHTML = markup;
    bottomNav.innerHTML = BOTTOM_NAV_ITEMS.map(
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
        !event.repeat &&
        ui.session &&
        !ui.session.complete &&
        event.target.tagName !== "BUTTON"
      ) {
        const action = ui.session.checked ? "continue-question" : "check-answer";
        handleAction(action, event.target);
      }
    });
    window.addEventListener("hashchange", syncRouteFromHash);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) cancelPlayback();
    });
    window.addEventListener("pagehide", () => {
      cancelPlayback();
      cleanupRecording(true);
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

    const conversationButton = event.target.closest("[data-open-conversation]");
    if (conversationButton) {
      openConversation(conversationButton.dataset.openConversation);
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
      const file = event.target.files && event.target.files[0];
      event.target.value = "";
      importBackup(file);
    }
  }

  function handleAction(action, button) {
    switch (action) {
      case "open-welcome":
        openWelcome();
        break;
      case "finish-welcome": {
        const firstTime = !state.hasSeenWelcome;
        state.hasSeenWelcome = true;
        saveState();
        closeModal();
        if (ui.conversation) {
          renderConversationSession();
          focusMain();
        } else if (firstTime) {
          go("talk");
        }
        break;
      }
      case "close-modal":
        closeModal();
        break;
      case "exit-session":
        ui.session = null;
        cancelPlayback();
        document.body.classList.remove("in-session");
        render();
        focusMain();
        break;
      case "exit-conversation":
        cleanupConversation();
        document.body.classList.remove("in-session");
        window.history.replaceState(null, "", "#talk");
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
          markAudioButton(button, true);
          playPhraseReference(entry.phrase, action === "play-slow").then((didPlay) => {
            markAudioButton(button, false);
            if (didPlay === null) return;
            const challenge = ui.session?.challenges?.[ui.session.index];
            if (
              challenge?.mode?.id === "listenForMeaning" &&
              challenge.phraseID === entry.phrase.id
            ) {
              if (didPlay) {
                ui.session.audioPlayed = true;
              } else if (didPlay === false) {
                const fallback = config.challengeModes?.find(
                  (item) =>
                    item.id === (config.nonSpeakableListenFallback || "readForMeaning")
                );
                if (fallback) challenge.mode = fallback;
              }
              renderSession();
              requestAnimationFrame(() => {
                if (didPlay) {
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
          });
        }
        break;
      }
      case "play-conversation-line":
      case "play-conversation-line-slow":
        playCurrentConversationLine(action.endsWith("slow"), button);
        break;
      case "play-exchange":
        playConversationExchange(button);
        break;
      case "previous-conversation-line":
        moveConversationLine(-1);
        break;
      case "next-conversation-line":
        moveConversationLine(1);
        break;
      case "start-recording":
        startRecording();
        break;
      case "stop-recording":
        stopRecording();
        break;
      case "discard-take":
        discardTake();
        break;
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
    cleanupConversation();
    if (ui.session) {
      ui.session = null;
      document.body.classList.remove("in-session");
    }
    ui.lessonDetail = null;
    cancelPlayback();
    ui.section = section;
    if (section !== "practice") ui.practice = null;
    const nextHash = `#${section}`;
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash;
    }
    render();
    focusMain();
    scrollTop();
  }

  function sectionFromHash(fallback = "home") {
    const value = window.location.hash.replace(/^#/, "").split("/")[0];
    if (value === "main-content") return fallback;
    return NAV_ITEMS.some((item) => item.id === value) ? value : "home";
  }

  function conversationIDFromHash() {
    const [section, encodedID] = window.location.hash.replace(/^#/, "").split("/");
    if (section !== "talk" || !encodedID) return null;
    try {
      return decodeURIComponent(encodedID);
    } catch (_error) {
      return null;
    }
  }

  function syncRouteFromHash() {
    const rawHash = window.location.hash.replace(/^#/, "");
    if (rawHash === "main-content") return;
    const next = sectionFromHash(ui.section);
    const conversationID = conversationIDFromHash();

    if (next === "talk" && conversationID) {
      if (ui.conversation?.id !== conversationID) {
        if (!openConversation(conversationID, false)) {
          cleanupConversation();
          ui.section = "talk";
          window.history.replaceState(null, "", "#talk");
          render();
          focusMain();
        }
      }
      return;
    }

    if (next === ui.section) {
      if (ui.conversation) {
        cleanupConversation();
        document.body.classList.remove("in-session");
        render();
        focusMain();
      }
      return;
    }

    cleanupConversation();
    ui.section = next;
    ui.session = null;
    ui.lessonDetail = null;
    document.body.classList.remove("in-session");
    cancelPlayback();
    if (next !== "practice") ui.practice = null;
    render();
    focusMain();
  }

  function render() {
    if (!lessons.length) {
      main.innerHTML = `<section class="page"><div class="card empty-state"><h1>Course data could not load</h1><p>Refresh the page to try again.</p></div></section>`;
      return;
    }

    updateChrome();
    document.body.classList.toggle("in-session", Boolean(ui.session || ui.conversation));
    if (ui.session) {
      renderSession();
      return;
    }
    if (ui.conversation) {
      renderConversationSession();
      return;
    }

    switch (ui.section) {
      case "learn":
        if (ui.lessonDetail) renderLessonDetail(ui.lessonDetail);
        else renderLearn();
        break;
      case "talk":
        renderTalk();
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
  }

  function renderHome() {
    const nextLesson = lessons.find((lesson) => lessonProgress(lesson) < 1);
    const due = dueEntries().length;
    const roots = state.familyRoots.trim() || config.heritageTrack;
    main.innerHTML = `
      <section class="page">
        <header class="page-header">
          <div class="page-title">
            <span class="eyebrow">A return to your roots</span>
            <h1>Sholem aleykhem</h1>
            <p>Come back to the language through voices, memories, and small expressions of care—always in Latin letters.</p>
          </div>
        </header>

        <div class="roots-path-card">
          <span class="roots-path-mark" aria-hidden="true">⌖</span>
          <div><span class="eyebrow">${esc(roots)}</span><strong>A language carried through people</strong><p>Each phrase is a way back: hear it, understand what it carries, and make room for your family’s own version.</p></div>
        </div>

        <button class="talk-hero" type="button" data-go="talk">
          <span class="talk-hero-icon" aria-hidden="true">“</span>
          <span class="talk-hero-copy">
            <span class="eyebrow">Zog mir · Speak with me</span>
            <strong>A real little exchange</strong>
            <span>Hear the feeling, answer aloud, and listen back—one family moment at a time.</span>
          </span>
          <span class="talk-hero-action" aria-hidden="true">→</span>
        </button>

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
              <span class="pill" style="--tone:var(--sage)">◆ Return gently</span>
              <span class="eyebrow">Recall</span>
            </div>
            <h2>${due ? "A short review is waiting" : "Build a memory worth keeping"}</h2>
            <p>${
              due
                ? "Return to the phrases that are fading and let them become familiar again."
                : "Complete a lesson, then spaced review will bring each phrase back at the right time."
            }</p>
            <button class="plain-link" type="button" data-go="${due ? "practice" : "learn"}">${
              due ? "Start review" : "Choose a lesson"
            } →</button>
          </article>
        </div>

        <p class="notice"><span class="notice-icon" aria-hidden="true">ⓘ</span><span><strong>About the voice.</strong> Every clip you hear is a synthesized version of a family member’s voice reading the reference spelling, so it is warm and familiar but an approximation, not an archive recording; it is the same on every device and never swaps in a browser voice. Your recordings stay in this tab and disappear when you leave the exchange.</span></p>
        <button class="text-button" type="button" data-action="open-welcome">How Ziskeit works</button>
      </section>`;
  }

  function continueCard(lesson) {
    const started = lessonProgress(lesson) > 0;
    return `<button class="continue-card" type="button" data-start-lesson="${escAttr(lesson.id)}">
      <span class="lesson-glyph" aria-hidden="true">${lessonGlyph(lesson)}</span>
      <span class="continue-copy">
        <span class="eyebrow">${started ? "Return" : "Begin here"} · Lesson ${lesson.number}</span>
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

  function renderTalk() {
    main.innerHTML = `<section class="page talk-page">
      <header class="page-header talk-heading">
        <div class="page-title">
          <span class="eyebrow">Zog mir · Speak with me</span>
          <h1>Learn it as a conversation</h1>
          <p>Short exchanges with the warmth, worry, teasing, and rhythm a family phrase carries. Hear a line, answer it, then listen to yourself.</p>
        </div>
        <button class="secondary-button" type="button" data-go="phrasebook">Open phrasebook</button>
      </header>

      <div class="conversation-grid">
        ${
          conversations.length
            ? conversations.map(conversationCard).join("")
            : `<div class="card empty-state"><h2>Conversation scenes could not load</h2><p>Refresh the page to try again.</p></div>`
        }
      </div>

      <p class="notice"><span class="notice-icon" aria-hidden="true">⌖</span><span>The pronunciation cues are broad Southeastern candidates for the Bessarabia–Odessa family route. Your aunt’s or family’s remembered version has the final word.</span></p>
    </section>`;
  }

  function conversationCard(conversation, index) {
    const firstGuideLine =
      conversation.lines.find((line) => line.speaker === "Guide") || conversation.lines[0];
    return `<button class="card conversation-card" type="button" data-open-conversation="${escAttr(
      conversation.id
    )}">
      <span class="conversation-number" aria-hidden="true">${String(index + 1).padStart(
        2,
        "0"
      )}</span>
      <span class="conversation-card-copy">
        <span class="conversation-meta"><span>${esc(conversation.mood)}</span><span>${
          conversation.lines.length
        } lines</span></span>
        <strong>${esc(conversation.title)}</strong>
        <span>${esc(conversation.setting)}</span>
        <q>${esc(firstGuideLine.transliteration)}</q>
      </span>
      <span class="conversation-arrow" aria-hidden="true">→</span>
    </button>`;
  }

  function openConversation(conversationID, updateHash = true) {
    const conversation = conversations.find((item) => item.id === conversationID);
    if (!conversation) return false;
    cleanupConversation();
    ui.section = "talk";
    ui.session = null;
    ui.lessonDetail = null;
    ui.conversation = {
      id: conversationID,
      index: 0,
      recording: false,
      recordingPending: false,
      takeUrl: null,
      takeLineID: null,
      recordingError: "",
    };
    document.body.classList.add("in-session");
    const nextHash = `#talk/${conversationID}`;
    if (updateHash && window.location.hash !== nextHash) {
      window.history.replaceState(null, "", nextHash);
    }
    updateChrome();
    renderConversationSession();
    window.scrollTo({ top: 0 });
    focusMain();
    return true;
  }

  function currentConversation() {
    if (!ui.conversation) return null;
    return conversations.find((item) => item.id === ui.conversation.id) || null;
  }

  function renderConversationSession() {
    const conversation = currentConversation();
    if (!conversation) {
      cleanupConversation();
      return renderTalk();
    }
    const index = Math.min(ui.conversation.index, conversation.lines.length - 1);
    const line = conversation.lines[index];
    const progress = ((index + 1) / conversation.lines.length) * 100;
    const isYourTurn = line.speaker === "You";
    const hasTake =
      ui.conversation.takeUrl && ui.conversation.takeLineID === line.id;
    const guide = guideName(conversation);
    const speaker = isYourTurn ? "You" : guide;

    document.body.classList.add("in-session");
    main.innerHTML = `<section class="session-page conversation-session">
      <header class="session-header">
        <button class="icon-button" type="button" data-action="exit-conversation" aria-label="Leave this conversation">×</button>
        <div class="session-progress" role="progressbar" aria-label="Conversation progress" aria-valuemin="1" aria-valuemax="${
          conversation.lines.length
        }" aria-valuenow="${index + 1}"><span style="--width:${progress}%"></span></div>
        <span class="conversation-counter">${index + 1}/${conversation.lines.length}</span>
      </header>

      <div class="conversation-scene-head">
        <div>
          <span class="eyebrow">${esc(conversation.mood)}</span>
          <h1>${esc(conversation.title)}</h1>
          <p>${esc(conversation.setting)}</p>
        </div>
        <button class="secondary-button exchange-button" type="button" data-action="play-exchange">▶ Hear the exchange</button>
      </div>

      <article class="card dialogue-card ${isYourTurn ? "your-turn" : "guide-turn"}" aria-labelledby="dialogue-line">
        <div class="speaker-row">
          <span class="speaker-avatar" aria-hidden="true">${isYourTurn ? "Y" : esc(
            guide.slice(0, 1)
          )}</span>
          <div><span class="speaker-name">${esc(speaker)}</span><span class="speaker-intent">${esc(
            line.emotion
          )}</span></div>
          <span class="turn-label">${isYourTurn ? "Your turn" : "Listen first"}</span>
        </div>

        <div class="dialogue-copy">
          <h2 id="dialogue-line" tabindex="-1">${esc(line.transliteration)}</h2>
          <p class="dialogue-meaning">${esc(line.meaning)}</p>
          <p class="dialogue-pronunciation"><span>Southeastern family form</span>${esc(
            line.pronunciation
          )}</p>
          <div class="rhythm-row" aria-label="Rhythm chunks">
            ${line.rhythmChunks
              .map((chunk) => `<span>${esc(chunk)}</span>`)
              .join(`<i aria-hidden="true">·</i>`)}
          </div>
          ${index === 0 ? '<p class="listen-coach">The clip reads the reference spelling above; the family form shows the vowels a Bessarabia–Odessa relative may have used.</p>' : ""}
        </div>

        <div class="dialogue-actions">
          <button class="primary-button" type="button" data-action="play-conversation-line">▶ Natural pace</button>
          <button class="secondary-button" type="button" data-action="play-conversation-line-slow">◷ Slow it down</button>
        </div>

        ${
          isYourTurn
            ? `<div class="record-panel">
                <div><strong>Now say it back</strong><span>Match the feeling and the stressed words, then compare.</span></div>
                <button class="${
                  ui.conversation.recording ? "danger-button recording-button" : "secondary-button"
                }" type="button" data-action="${
                  ui.conversation.recording ? "stop-recording" : "start-recording"
                }" ${ui.conversation.recordingPending ? "disabled" : ""}><span class="record-dot" aria-hidden="true"></span>${
                  ui.conversation.recording
                    ? "Stop recording"
                    : ui.conversation.recordingPending
                      ? "Waiting for microphone…"
                      : "Record my line"
                }</button>
              </div>
              ${
                hasTake
                  ? `<div class="take-panel"><div><strong>Your take</strong><span>Listen for rhythm and warmth, not perfection.</span></div><audio controls preload="metadata" aria-label="Your recorded take" src="${escAttr(
                    ui.conversation.takeUrl
                  )}"></audio><button class="text-button" type="button" data-action="discard-take">Discard</button></div>`
                  : ""
              }
              ${
                ui.conversation.recordingError
                  ? `<p class="recording-error" role="status">${esc(
                      ui.conversation.recordingError
                    )}</p>`
                  : ""
              }`
            : `<p class="listen-coach">Let the line land as one thought. Notice where ${esc(
                guide
              )} leans on the affectionate word.</p>`
        }
      </article>

      <aside class="expression-card">
        <span class="eyebrow">What the words carry</span>
        <strong>${esc(conversation.beautifulExpression)}</strong>
        <p>${esc(conversation.reflection || "A small expression that keeps a family feeling close.")}</p>
      </aside>

      <details class="dialect-disclosure">
        <summary>Why it may sound different in your family</summary>
        <p>${esc(conversation.dialectNote)}</p>
        <span>${esc(confidenceLabel(conversation.confidence))}</span>
      </details>

      <nav class="conversation-step-nav" aria-label="Conversation lines">
        <button class="secondary-button" type="button" data-action="previous-conversation-line" ${
          index === 0 ? "disabled" : ""
        }>← Previous</button>
        <button class="primary-button" type="button" data-action="next-conversation-line">${
          index === conversation.lines.length - 1 ? "Finish exchange" : "Next line →"
        }</button>
      </nav>
    </section>`;
  }

  function guideName(conversation) {
    if (["phone-check-in", "come-in", "soup", "kitchen"].includes(conversation.id)) {
      return "Bobe";
    }
    if (["grandfathers-story", "family-saying"].includes(conversation.id)) return "Zeyde";
    return "Family elder";
  }

  function confidenceLabel(confidence) {
    return confidence === "broad Southeastern"
      ? "Broad Southeastern starting point"
      : "Family candidate · confirm it with a relative";
  }

  function moveConversationLine(amount) {
    const conversation = currentConversation();
    if (!conversation) return;
    const next = ui.conversation.index + amount;
    if (next >= conversation.lines.length) {
      cleanupConversation();
      document.body.classList.remove("in-session");
      window.history.replaceState(null, "", "#talk");
      render();
      focusMain();
      showToast("Exchange complete. Zeyer gut!");
      return;
    }
    if (next < 0) return;
    cancelPlayback();
    cleanupRecording(false);
    ui.conversation.index = next;
    ui.conversation.recordingError = "";
    renderConversationSession();
    scrollTop();
    requestAnimationFrame(() => document.querySelector("#dialogue-line")?.focus());
  }

  function renderLearn() {
    main.innerHTML = `
      <section class="page">
        <header class="page-header learn-heading">
          <div class="page-title">
            <span class="eyebrow">Seven short lessons</span>
            <h1>Learn by using it</h1>
            <p>Read, listen, recall, and notice regional clues. There is no Hebrew alphabet to memorize.</p>
          </div>
          <button class="secondary-button" type="button" data-go="phrasebook">Open phrasebook</button>
        </header>
        <div class="lesson-list">
          ${lessons.map(lessonRow).join("")}
        </div>
        <p class="notice"><span class="notice-icon" aria-hidden="true">⌖</span><span>“Bessarabia–Odessa” names a family geography, not one perfectly uniform dialect. Regional notes are clues; your household form has the final say.</span></p>
      </section>`;
  }

  function lessonRow(lesson) {
    const progress = lessonProgress(lesson);
    const tone = toneColor(lesson.tone);
    return `<button class="lesson-row" type="button" data-open-lesson="${escAttr(lesson.id)}" style="--tone:${tone}">
      <span class="lesson-number">${progress === 1 ? "✓" : lesson.number}</span>
      <span class="lesson-row-copy">
        <h2>${esc(lesson.title)}</h2>
        <p>${esc(lesson.subtitle)}</p>
      </span>
      <span class="lesson-meta">
        <span>${lesson.minutes} min · ${lesson.phrases.length} expressions</span>
      </span>
    </button>`;
  }

  function renderLessonDetail(lessonID) {
    const lesson = lessons.find((item) => item.id === lessonID);
    if (!lesson) {
      ui.lessonDetail = null;
      return renderLearn();
    }
    const started = lessonProgress(lesson) > 0;
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
        )}">${started ? "Return to lesson" : "Start lesson"} →</button>
      </header>
      <div class="dialect-note"><span aria-hidden="true">⌖</span><span><strong>Dialect note.</strong> ${esc(
        lesson.dialectNote
      )}</span></div>
      <div class="lesson-reference-list">
        ${lesson.phrases.map((phrase, index) => lessonReferenceCard(lesson, phrase, index)).join("")}
      </div>
      <div class="lesson-detail-footer">
        <div><strong>${started ? "A place to return to" : "Begin when you are ready"}</strong></div>
        <button class="primary-button" type="button" data-start-lesson="${escAttr(
          lesson.id
        )}">${started ? "Return to this lesson" : "Start this lesson"}</button>
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
      checkedAt: 0,
      audioPlayed: false,
      correct: false,
      missed: [],
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
    return lesson.phrases.map((phrase, index) => {
      let modeID = modeCycle[index % modeCycle.length];
      if (modeID === "listenForMeaning" && !phrase.canSpeak) {
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
      main.innerHTML = `<section class="session-page">
        <div class="card completion-card">
          <div class="completion-badge" aria-hidden="true">✓</div>
          <span class="eyebrow">Lesson ${lesson.number} complete</span>
          <h1>${esc(lesson.title)}</h1>
          <p>You spent time with ${lesson.phrases.length} pieces of living Yiddish. Let them settle, then return to the ones that still feel unfamiliar.</p>
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
          <span class="prompt-kicker">Pronunciation reference · listen for the feeling</span>
          <button class="big-listen" type="button" data-action="play" data-phrase-id="${escAttr(phrase.id)}" aria-label="Play pronunciation reference">▶</button>
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
        <div class="session-progress" role="progressbar" aria-label="Lesson progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(progress)}"><span style="--width:${progress}%"></span></div>
        <div class="session-marker">Lesson ${lesson.number}</div>
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
          audioLocked ? "Listen to the line first" : "Choose one answer"
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
    session.checkedAt = Date.now();
    if (!session.correct && !session.missed.includes(challenge.phraseID)) {
      session.missed.push(challenge.phraseID);
    }
    saveState();
    renderSession();
    requestAnimationFrame(() => document.querySelector("#answer-feedback")?.focus());
  }

  function continueQuestion() {
    const session = ui.session;
    if (!session || !session.checked) return;
    if (Date.now() - (session.checkedAt || 0) < 400) return;
    if (session.index < session.challenges.length - 1) {
      session.index += 1;
      session.selected = null;
      session.checked = false;
      session.audioPlayed = false;
      session.correct = false;
      renderSession();
      scrollTop();
      requestAnimationFrame(() => document.querySelector("#session-question-title")?.focus());
      return;
    }

    const lesson = lessons.find((item) => item.id === session.lessonID);
    completeLesson(lesson, session.missed);
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
          <p>You brought familiar phrases back to mind. Let them rest, or spend a little more time with them now.</p>
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
                ${ratingButton("Needs time", "bring it back soon", "again", "#8b2335")}
                ${ratingButton("I remember", "let it rest", "good", "#315843")}
                ${ratingButton("Feels familiar", "keep it close", "easy", "#386791")}
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
    return `<span class="phrase-actions" aria-label="Pronunciation reference controls">
      <button class="audio-button" type="button" data-action="play" data-phrase-id="${escAttr(
        phrase.id
      )}" aria-label="Play pronunciation reference for ${escAttr(phrase.transliteration)}">${
        compact ? "▶" : "▶ Play"
      }</button>
      <button class="audio-button" type="button" data-action="play-slow" data-phrase-id="${escAttr(
        phrase.id
      )}" aria-label="Play pronunciation reference slowly for ${escAttr(
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
          <div class="welcome-logo"><img src="assets/icon-192.png" alt=""><div><strong>Ziskeit</strong><br><small>ZISS-kite · my sweet one</small></div></div>
          <div class="welcome-hero"><h1 id="welcome-title">Come talk a little.</h1><p>A conversation-first Yiddish course for family roots from Bessarabia to Odessa, written entirely in Latin letters.</p></div>
          <div class="welcome-features">
            ${welcomeFeature("Aa", "No Hebrew alphabet", "Read a consistent Latin transliteration and an easy sound guide.")}
            ${welcomeFeature("⌖", "Bessarabia–Odessa aware", "Compare a stable reference form with broad Southeastern family pronunciation.")}
            ${welcomeFeature("“", "Practice a real exchange", "Hear the feeling, answer aloud, record your line, and listen back.")}
            ${welcomeFeature("♥", "Your family gets the last word", "Save the exact words, vowels, places, and memories your relatives used.")}
          </div>
          <button class="primary-button welcome-cta" type="button" data-action="finish-welcome">Start talking →</button>
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
      canSpeak: false,
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

  function dueEntries() {
    const now = Date.now();
    return practiceEntries().filter(({ phrase }) => {
      if (!isLearned(phrase.id)) return false;
      const due = Date.parse(state.reviewStates[phrase.id]?.dueAt || "");
      return !Number.isFinite(due) || due <= now;
    });
  }

  function dateKey(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function safeNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
  }

  function markAudioButton(button, playing) {
    if (!button?.isConnected) return;
    button.disabled = playing;
    if (playing) button.setAttribute("aria-busy", "true");
    else button.removeAttribute("aria-busy");
  }

  async function playPhraseReference(phrase, slowly = false) {
    if (!phrase?.canSpeak) return false;
    cancelPlayback();
    const source = `audio/phrases/${encodeURIComponent(phrase.id)}.m4a`;
    const played = await playSource(source, slowly, false);
    if (played === false) {
      showToast(audioUnavailableMessage("Use the written sound guide for this line."));
    }
    return played;
  }

  async function playCurrentConversationLine(slowly, button) {
    const conversation = currentConversation();
    if (!conversation) return;
    const line = conversation.lines[ui.conversation.index];
    cancelPlayback();
    markAudioButton(button, true);
    const source = conversationAudioSource(conversation, line);
    const played = await playSource(source, slowly, false);
    markAudioButton(button, false);
    if (played === false) {
      showToast(audioUnavailableMessage("Follow the written rhythm instead."));
    }
  }

  async function playConversationExchange(button) {
    const conversation = currentConversation();
    if (!conversation) return;
    cancelPlayback();
    const sequenceToken = conversationSequenceToken;
    markAudioButton(button, true);
    for (const line of conversation.lines) {
      if (sequenceToken !== conversationSequenceToken || !ui.conversation) break;
      const played = await playSource(
        conversationAudioSource(conversation, line),
        false,
        true
      );
      if (played === false && sequenceToken === conversationSequenceToken) {
        showToast(audioUnavailableMessage("Follow the written rhythm instead."));
        break;
      }
      if (!played || sequenceToken !== conversationSequenceToken) break;
      await shortPause(230);
    }
    markAudioButton(button, false);
  }

  function conversationAudioSource(conversation, line) {
    return `audio/conversations/${encodeURIComponent(conversation.id)}-${encodeURIComponent(
      line.id
    )}.m4a`;
  }

  async function playSource(source, slowly, untilEnd) {
    stopActiveMedia();
    const token = mediaToken;
    return playStaticAudio(source, slowly, untilEnd, token);
  }

  function playStaticAudio(source, slowly, untilEnd, token) {
    return new Promise((resolve) => {
      let settled = false;
      let started = false;
      const audio = new Audio(source);
      activeAudio = audio;
      audio.preload = "auto";
      audio.playsInline = true;
      audio.playbackRate = slowly ? 0.78 : 1;
      if ("preservesPitch" in audio) audio.preservesPitch = true;
      if ("webkitPreservesPitch" in audio) audio.webkitPreservesPitch = true;

      const finish = (result) => {
        if (settled) return;
        settled = true;
        if (activePlaybackAbort === abort) activePlaybackAbort = null;
        if (activeAudio === audio && (untilEnd || !result)) activeAudio = null;
        resolve(result);
      };
      const abort = () => {
        audio.pause();
        finish(null);
      };
      activePlaybackAbort = abort;
      const onStarted = () => {
        if (started || token !== mediaToken) return;
        started = true;
        if (!untilEnd) finish(true);
      };
      audio.onplaying = onStarted;
      audio.onended = () => finish(started);
      audio.onerror = () => finish(false);
      try {
        const playResult = audio.play();
        if (playResult?.then) playResult.then(onStarted).catch(() => finish(false));
      } catch (_error) {
        finish(false);
      }
    });
  }

  function stopActiveMedia() {
    mediaToken += 1;
    if (activePlaybackAbort) activePlaybackAbort();
    activePlaybackAbort = null;
    if (activeAudio) {
      activeAudio.pause();
      activeAudio.removeAttribute("src");
      activeAudio.load();
      activeAudio = null;
    }
  }

  function cancelPlayback() {
    conversationSequenceToken += 1;
    stopActiveMedia();
  }

  function shortPause(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  async function startRecording() {
    const conversation = currentConversation();
    if (!conversation || ui.conversation.recording || ui.conversation.recordingPending) return;
    const line = conversation.lines[ui.conversation.index];
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      ui.conversation.recordingError =
        "This browser cannot record here. You can still say the line aloud and use the written rhythm.";
      renderConversationSession();
      return;
    }
    cancelPlayback();
    cleanupRecording(false);
    const requestToken = ++recordingRequestToken;
    ui.conversation.recordingError = "";
    ui.conversation.recordingPending = true;
    renderConversationSession();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (
        requestToken !== recordingRequestToken ||
        !ui.conversation ||
        currentConversation()?.id !== conversation.id ||
        currentConversation()?.lines[ui.conversation.index]?.id !== line.id
      ) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      mediaStream = stream;
      const mimeType = preferredRecordingType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorder = recorder;
      recordingChunks = [];
      ui.conversation.recordingPending = false;
      recorder.ondataavailable = (event) => {
        if (event.data?.size) recordingChunks.push(event.data);
      };
      recorder.onerror = () => {
        if (!ui.conversation) return;
        ui.conversation.recordingError = "The recording stopped unexpectedly. Please try once more.";
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(recordingChunks, { type });
        recordingChunks = [];
        mediaStream?.getTracks().forEach((track) => track.stop());
        mediaStream = null;
        mediaRecorder = null;
        if (!ui.conversation) return;
        ui.conversation.recording = false;
        ui.conversation.recordingPending = false;
        if (blob.size) {
          if (ui.conversation.takeUrl) URL.revokeObjectURL(ui.conversation.takeUrl);
          ui.conversation.takeUrl = URL.createObjectURL(blob);
          ui.conversation.takeLineID = line.id;
        } else {
          ui.conversation.recordingError = "No sound was captured. Check the microphone and try again.";
        }
        renderConversationSession();
        requestAnimationFrame(() => document.querySelector(".take-panel audio")?.focus());
      };
      recorder.start();
      ui.conversation.recording = true;
      renderConversationSession();
    } catch (_error) {
      mediaStream?.getTracks().forEach((track) => track.stop());
      mediaStream = null;
      mediaRecorder = null;
      if (!ui.conversation) return;
      ui.conversation.recording = false;
      ui.conversation.recordingPending = false;
      ui.conversation.recordingError =
        "Microphone access was not available. You can allow it in the browser’s site settings and try again.";
      renderConversationSession();
    }
  }

  function stopRecording() {
    if (mediaRecorder?.state === "recording") mediaRecorder.stop();
  }

  function preferredRecordingType() {
    const types = [
      "audio/webm;codecs=opus",
      "audio/mp4;codecs=mp4a.40.2",
      "audio/mp4",
    ];
    return types.find((type) => MediaRecorder.isTypeSupported?.(type)) || "";
  }

  function discardTake(silent = false) {
    if (!ui.conversation) return;
    if (ui.conversation.takeUrl) URL.revokeObjectURL(ui.conversation.takeUrl);
    ui.conversation.takeUrl = null;
    ui.conversation.takeLineID = null;
    if (!silent) renderConversationSession();
  }

  function cleanupRecording(revokeTake = false) {
    recordingRequestToken += 1;
    if (mediaRecorder) {
      mediaRecorder.ondataavailable = null;
      mediaRecorder.onstop = null;
      if (mediaRecorder.state !== "inactive") mediaRecorder.stop();
      mediaRecorder = null;
    }
    mediaStream?.getTracks().forEach((track) => track.stop());
    mediaStream = null;
    recordingChunks = [];
    if (ui.conversation) {
      ui.conversation.recording = false;
      ui.conversation.recordingPending = false;
      if (revokeTake && ui.conversation.takeUrl) {
        URL.revokeObjectURL(ui.conversation.takeUrl);
        ui.conversation.takeUrl = null;
        ui.conversation.takeLineID = null;
      }
    }
  }

  function cleanupConversation() {
    cancelPlayback();
    cleanupRecording(true);
    ui.conversation = null;
  }

  function exportBackup() {
    const payload = {
      app: "Ziskeit",
      format: 1,
      exportedAt: new Date().toISOString(),
      state,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ziskeit-backup-${dateKey(new Date())}.json`;
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
        !["Mameloshn", "Ziskeit"].includes(parsed?.app) ||
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
          : "That file is not a Ziskeit backup. Your current course was left unchanged."
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

  function audioUnavailableMessage(hint) {
    return navigator.onLine === false
      ? `You are offline and this clip has not been saved on this device yet. ${hint}`
      : `Audio is unavailable. ${hint}`;
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

  function scrollTop() {
    window.scrollTo({ top: 0, behavior: reduceMotion?.matches ? "auto" : "smooth" });
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
