# Interview Prep App: Research, Recommendation and Build Plan

Oct 11, 2026 · @Erfan

## TL;DR

Build a free, local-first interview-prep app (working name **Onsite**) where a 10-minute adaptive placement test finds your weakest patterns, then it recommends drills and LeetCode problems aimed at those gaps, tracks a skill graph of every topic with solved counts, and adds a DSA-aware code visualizer and structured mock interviews. Every model is either trained by you on free GPUs or runs in the user's browser, and hosting sits on Cloudflare's free tier, so it costs you $0/month.

**Why this concept wins**

- **The gap is the measurement, not the content.** Spaced-repetition trackers, pattern quizzes, code visualizers and AI mock interviewers all exist separately. None I found gives a calibrated per-pattern skill estimate plus an adaptive diagnostic, and the paid platforms charge $119 to $459.
- **Recruiter signal is ML systems, not prompts.** Three models you train and evaluate (pattern classifier, difficulty predictor, complexity classifier), an IRT adaptive-testing engine with a simulation study, a WebAssembly code sandbox, and in-browser ONNX inference.
- **It fits flexible time.** Sessions are built to the minutes the user has (10, 30 or 90), with weekly goals instead of daily streak pressure.

**Three decisions that shape everything**

1. Write an original item and problem bank; link out to LeetCode by slug, never copy its problem text (its Terms forbid scraping and claim all problem content).
2. Core ML = small trained models. A small in-browser LLM is an optional extra for hint wording and interviewer follow-ups, never the judge.
3. First usable version = the Pattern Spotter drills + the skill graph; deployment comes last, once the app is done.

## Competitive landscape

The market is split into content platforms, mock-interview services and small single-feature tools; none measures skill per pattern and adapts to it. Prices are as listed on third-party reviews checked in 2026 and move with sales.

| Tool | What it does | Price (2026) | ML / AI use | Gap we fill |
| --- | --- | --- | --- | --- |
| [LeetCode Premium](https://www.techinterview.org/bootcamp_directory/p/leetcode-premium/) | \~3,800 problems, company tags, debugger, timed company assessments | $35/mo or $159/yr | "Ask Leet" assistant and coding agent with monthly credits ([release notes](https://leetcode.com/discuss/post/5736503/)) | No skill model, no adaptive diagnosis, no readiness estimate |
| [NeetCode Pro](https://www.techinterview.org/bootcamp_directory/p/neetcode-pro/) | Roadmap, videos, 300+ problems with judge in 8 languages, company tags | $119/yr or $297 lifetime | NeetBot AI hints and debug | No mock interviews or behavioral, per its Pro page |
| [AlgoMonster](https://www.lodely.com/blog/algoexpert-pricing) | Pattern-based lessons and problems | $119 to $299/yr, $459 lifetime | Not documented | Static path, no measurement |
| [AlgoExpert](https://www.lodely.com/blog/algoexpert-pricing) | 160 curated problems with videos | $99 to $199/yr | Not documented | Small fixed set, annual renewals |
| [interviewing.io](https://www.techinterview.org/bootcamp_directory/p/interviewing-io/) | Anonymous mocks with FAANG interviewers, free AI interviewer | From $179/session; AI interviewer free | AI interviewer over 200+ problems | Practice, not learning: assumes you know what to work on |
| [Exponent + Pramp](https://fast.io/resources/best-ai-interview-prep-tools-2026/) | Peer mocks, courses | Free 5 peer sessions/mo; Pro $12 to $79/mo | Course and mock tooling | Peer quality varies; no per-pattern diagnosis |
| [Final Round AI, LockedIn, Verve](https://hedy.ai/post/best-ai-interview-assistant-tools/) | AI mocks plus real-time interview "copilots" | \~$25 to $150/mo | LLM APIs | Cheating-adjacent; not a learning tool |
| [Python Tutor](https://research.google/pubs/pub40591/) | Step-through visualizer for Python | Free | None | Generic, not interview-aware (no pointer or DP views) |
| [Leetcode Anki](https://addons.mozilla.org/en-US/firefox/addon/leetcode-anki/), [dsaprep.dev](https://hn.svelte.dev/item/45436942), [Recall Tracker](https://github.com/vittorio-centore/leetcode-tracker) | Spaced repetition over problems (SM-2 or fixed intervals) | Free | Scheduling heuristics only | Schedules problems, not skills; no diagnosis |
| [Interview Pattern Trainer](https://github.com/FrancisTRdev/swe-interview-practice) | Pattern flashcards and problem-to-pattern quizzes | Free (open source) | None | Static quizzes, no adaptivity or skill model |

**Takeaway:** spaced repetition and pattern quizzes are already crowded as standalone features. The defensible slice is a free product that *measures* (adaptive diagnosis, calibrated per-pattern mastery, readiness) and then routes the user's limited time.

## User pain points and gaps

The loudest pain is failing to recognize which pattern a new problem needs, even after hundreds of solves; forgetting comes second and is already well served.

| Pain | Evidence | Served today by | Verdict |
| --- | --- | --- | --- |
| Can't recognize the pattern on an unseen problem | [Blind thread](https://www.teamblind.com/post/feel-like-im-hitting-a-wall-with-leetcode-dspwtyww), [Medium essay on freezing at problem 201](https://levelup.gitconnected.com/i-solved-200-leetcode-problems-and-froze-on-problem-201-d3d3deb1282f), [r/leetcode post on OAs](https://red.127.pp.ua/r/leetcode/comments/1lcyzgn/struggling_to_improve_at_oas) | Articles and static quizzes | **Confirmed, under-served.** Core of our app |
| Forgetting solved problems | Blind commenter can't recall solutions after weeks; [Show HN spaced-repetition tool](https://hn.svelte.dev/item/45436942) | Several SR trackers and extensions | Confirmed, **crowded**. Include, don't lead with it |
| Memorizing solutions instead of learning | Same Blind thread: reading the answer and memorizing taught no pattern | Nothing measures this | Confirmed. Hint ladder + "solved with help" signal in the skill model |
| Too slow under time pressure (OAs) | r/leetcode OA post above | Timers on LeetCode | Plausible. Timed drills; latency feeds the model |
| DP and pointer logic are hard to picture | [Comment on DP state transitions](https://reactjava.substack.com/p/why-bytebytego-is-best-place-to-learn/comments), [linked-list visualizer builder](https://dev.to/rushedcomet/stop-debugging-by-hand-i-built-a-real-time-linked-list-visualizer-2hjm) | Python Tutor, one-off visualizers | Confirmed. DSA-aware visual tab |
| Communication is scored but rarely practiced | Google-style rubric scores [communication separately](https://www.techinterviewhandbook.org/coding-signals/) | Paid human mocks, AI copilots | Confirmed. Staged mock with rubric report |
| Not knowing when you're "ready" | No direct evidence found | Nobody | **Unverified hypothesis.** Validate with 10 user interviews before over-investing |
| Rigid study plans don't fit schedules | No direct evidence found; fits your own requirement | Fixed lists (Blind 75, NeetCode 150) | Unverified. Time-boxed sessions cost little to build |

## ML opportunities (free to run only)

The strongest free-to-run ML here is small, trained, measurable models plus psychometrics; in-browser LLMs work in 2026 but are a garnish, not the engine.

| Technique | Use in the app | Data and tooling | Where it runs | Verdict |
| --- | --- | --- | --- | --- |
| **Pattern classifier** (multi-label, \~20 patterns) | Tags original items; explains "signal phrases" in pattern drills; picks the visualizer view | [LeetCodeDataset](https://huggingface.co/datasets/newfacade/LeetCodeDataset): 2,869 problems, topic tags, release dates for a temporal split ([overview](https://alphaxiv.org/benchmarks/ieee/leetcodedataset)); baseline TF-IDF + logistic regression | Train on Kaggle/Colab; ONNX int8 in browser | **You train it. Model #1** |
| **Difficulty predictor** (text to rating) | Cold-start IRT difficulty for new items | [zerotrac ratings](https://github.com/zerotrac/leetcode_problem_rating): Elo/MLE ratings for \~2,300 contest problems ([merged dataset](https://github.com/bluebread/leetcode-company-wise-rating)); same trick the [Duolingo English Test uses](https://transacl.org/index.php/tacl/article/view/1743) to skip pilot testing | Train offline; tiny regressor | **You train it. Model #2** |
| **Complexity classifier** (code to Big-O class) | Checks the user's stated complexity; flags suboptimal code | [CodeComplex](https://arxiv.org/abs/2401.08719v2): 4,900 Python + 4,900 Java codes, expert labels, 7 classes, EMNLP Findings 2025 | Fine-tune CodeBERT/UniXcoder; ONNX in browser | **You train it. Model #3** (check dataset license) |
| IRT + adaptive testing (Rasch/2PL, CAT) | Placement test and re-assessments | [catsim](https://github.com/douglasrizzo/catsim) for selection and simulation; py-irt or girth for calibration | Item selection in browser; nightly recalibration in GitHub Actions | **Core.** Simulation study = great resume metric |
| Knowledge tracing | Per-pattern mastery and readiness | Start with Elo/BKT (no data needed). [Code-DKT](https://cs.paperswithcode.com/paper/code-dkt-a-code-based-knowledge-tracing-model) beats DKT by 3 to 4% AUC on [CodeWorkout](https://arxiv.org/pdf/2605.04727) | Browser (Elo); offline research (DKT) | Elo now; DKT/SAKT once you have logs |
| Spaced repetition | Brings back decaying *skills*, not problems | [FSRS-6](https://github.com/open-spaced-repetition) via ts-fsrs; Duolingo's [half-life regression](https://blog.duolingo.com/how-we-learn-how-you-learn) as a trained comparison later | Browser | Off the shelf |
| Next-item selection | Fills the user's chosen session length | Rules first (max information on weakest pattern within time budget); contextual bandit later | Browser | Rules for MVP |
| Small open LLM | Rewords hints, asks interviewer follow-ups | [WebLLM 0.2.85](https://pinggy.io/blog/run_llm_in_browser_webgpu/) has 163 prebuilt builds; [Qwen2.5-Coder-1.5B q4](https://huggingface.co/bernardw/qwen2.5-coder-1.5b-codereview-taid-q4-mlc) is \~0.84 GB | Browser via WebGPU, opt-in download | Optional v2, never the grader |
| Speech | Voice mock interviews | [Moonshine and Whisper](https://huggingface.co/spaces/moeru-ai/moonshine-web-vue/blob/f579272a432583a6824cbc25b5a4121f74ddb781/README.md) run locally via Transformers.js (WebGPU, WASM fallback); browser text-to-speech | Browser | Stretch |

**Runtime reality check.** [WebGPU now ships in Chrome, Firefox and Safari 26+](https://app.cinevva.com/guides/webgpu-vs-webgl-games), and [Transformers.js 4.3.0](https://pinggy.io/blog/run_llm_in_browser_webgpu/) falls back to WebAssembly. Chrome's built-in Gemini Nano needs over 4 GB VRAM and 22 GB free disk, so it can't be a dependency. Older Android GPUs remain patchy, so every model needs a no-GPU path.

**What you can defend in an interview:** three trained models, each with a baseline, a temporal or held-out split, and a metric (macro-F1, Spearman, accuracy plus the CodeComplex distance metric), shipped as quantized ONNX with measured in-browser latency.

## Code execution and visualization

Run Python in the user's browser with Pyodide in a Web Worker and trace it with sys.settrace: zero server cost, and untrusted code only ever runs on the user's own machine.

| Approach | Cost to you | Security burden | Languages | Fit |
| --- | --- | --- | --- | --- |
| **Pyodide in a Web Worker + sys.settrace** ([example build](https://github.com/harsit14/code_visualizer)) | $0 | Low: sandboxed by the browser; kill the worker on timeout | Python (JS natively) | **Pick for MVP** |
| Python Tutor engine on Pyodide ([live-py-tutor](https://github.com/livinNector/live-py-tutor)) | $0 | Low | Python | Good reference to study, generic views |
| Server sandbox (Judge0, Piston, gVisor, Firecracker) | A server per user, not free at scale | High: you own isolation and abuse | Many | Only if you later need Java/C++ |
| Debug Adapter Protocol | Server or desktop | Medium | Many | Overkill for a web app |

**Pitfalls to design for** (from a [builder's write-up](https://dev.to/viramchoksi/four-things-that-surprised-me-running-python-in-the-browser-4lci)): JS objects arrive as proxies and need explicit conversion; JS null is not Python None; each trace step must snapshot a copy or every step shows the final state; cap steps so infinite loops don't freeze the tab.

**The differentiator is DSA-aware views, not tracing.** Generic visualizers already exist, so render what interview code actually uses:

- **Arrays with named pointers:** i, j, left, right, lo, hi, mid drawn as labeled arrows over cells (two pointers, sliding window, binary search).
- **Linked lists and trees:** detect ListNode and TreeNode objects by shape and draw nodes with stable identity, so pointer rewiring is visible.
- **DP tables:** 2D lists drawn as a grid, highlighting the cell written this step and the cells it read.
- **Recursion:** call stack plus a growing recursion tree, with memo hits marked.
- **Hash maps, heaps, graphs:** key-value panel, heap as a tree, adjacency as nodes and edges.

Render with SVG in React; use D3 only for tree and graph layout. The pattern classifier picks the default view, and the user can switch.

## Mock interviews as diagnosis (Duolingo-inspired)

Copy the Duolingo English Test's shape: a fast adaptive section of auto-graded micro-items, then one open-ended task, combined into one report.

**What transfers from Duolingo.** The DET is [computer adaptive and scores with IRT](https://blog.englishtest.duolingo.com/how-is-the-duolingo-english-test-scored/), weighing both correctness and item difficulty. Its adaptive items all have an objectively correct answer so they score in real time, while open-ended prompts are scored separately ([Times Higher Education](https://www.timeshighereducation.com/student/blogs/what-questions-can-students-expect-duolingo-english-test)). Duolingo also predicted item difficulty from text to avoid costly pilot testing ([TACL paper](https://transacl.org/index.php/tacl/article/view/1743)), which is exactly what Model #2 does.

**Placement test (about 10 minutes).** Micro-items take 30 to 90 seconds each: name the pattern, pick the complexity, predict the output, spot the bug. After each answer, update a per-pattern ability estimate (Rasch with a shared prior), then serve the item with the most information on the most uncertain weak pattern. Stop at a standard-error threshold or 20 items, then give one short coding problem. When the user has filled in the comfort survey, its ratings set each pattern's starting estimate, so the test spends its items checking the claims instead of starting from zero.

**Structured coding mock (25 to 45 minutes, text first).** Interviewers commonly score [Algorithms, Coding, Communication and Problem Solving, each 1 to 4](https://prepfully.com/interview-guides/google-software-engineer-coding-interview). Each stage below is scored without an LLM, so results are free, deterministic and explainable.

| Stage | User does | Scored by | Rubric dimension |
| --- | --- | --- | --- |
| Clarify | Writes clarifying questions and edge cases | Match against the item's edge-case checklist (small in-browser embedding model) | Communication, Problem Solving |
| Approach | Names the pattern and describes the plan before coding | Pattern classifier vs reference; time spent before first keystroke | Algorithms, Communication |
| Complexity | States time and space Big-O | Compare with reference and Model #3 on their code | Algorithms |
| Code | Writes the solution under a timer | Hidden tests in Pyodide, hint level used, time to pass | Coding |
| Test | Writes their own test cases | Coverage of edge-case classes; catches a planted bug | Problem Solving |
| Voice mode (stretch) | Talks while solving | Local transcript: talk ratio, filler rate, explained-before-coding | Communication |

**The report** ranks weak areas with a confidence band per pattern, shows the evidence (which items, which stage), and offers the next session sized to the user's time.

**Evaluating the interviewer.** Deterministic scoring means the same transcript always gets the same score. To show validity, score 30 mocks yourself blind and report agreement (Cohen's kappa) with the automatic rubric.

**Engagement mechanics.** Streaks can backfire: a [Journal of Consumer Research study](https://thedecisionlab.com/fr-CA/insights/consumer-insights/streak-creep-the-perils-of-too-much-gamification) found users value extending a streak over the activity itself. A summary of Duolingo's growth work reports a limited-attempts mechanic gave no retention gain while leaderboards raised learning time 17% ([secondary source](https://nl.linkedin.com/in/ervin-dobri), unverified). For flexible usage, use weekly goals, earned streak freezes, visible skill decay ("Sliding Window is fading"), and opt-in leagues; skip hearts and lives.

## Data access and legal

Use your own original content and link out to LeetCode; never host its problem text or scrape it. This is a practical reading of public terms, not legal advice.

[LeetCode's Terms of Service](https://leetcode.com/terms) (last modified 04/05/2024) forbid crawling, scraping or spidering any part of the service, and claim all questions and solutions as LeetCode's exclusive copyrighted property. LeetCode has filed [DMCA takedowns](https://git.randommeaninglesscharacters.com/github/dmca/commit/2aefe88f5767e87d59596d2156f543a34b7334ce) against sites that copied its problems.

| Data | Approach | Risk |
| --- | --- | --- |
| Practice items and mock problems | Write originals (you plus Claude as an authoring partner at build time, not a runtime API) | Low |
| LeetCode problem references | Store slug, number, your own pattern tags; link to leetcode.com | Low |
| Datasets containing LeetCode text ([LeetCodeDataset](https://huggingface.co/datasets/newfacade/LeetCodeDataset), Apache-2.0 per its card) | Use for training only; never display or redistribute the text. A dataset's license can't grant rights LeetCode claims | Medium: flag in the model card |
| [zerotrac ratings](https://github.com/zerotrac/leetcode_problem_rating) | Numeric ratings for training Model #2, with attribution. Its author kept the crawler private to avoid terms issues | Low to medium |
| [CodeComplex](https://github.com/sybaik1/CodeComplex) | Training only; confirm its license before shipping a model trained on it | Check first |
| User's own LeetCode history | MVP: quick manual log (paste a link, rate how it went). No automated import: the GraphQL endpoint is unofficial and scraping is forbidden. A read-only browser extension is a gray area; defer it | Low (manual) |

Positioning matters too: market it as a companion that sends people to solve on LeetCode and NeetCode, not a replacement judge for their problems.

## Concept options

Concept A wins on recruiter signal and ML depth; E and B are absorbed into it as the front door and the visual tab, and C becomes a stretch goal.

| Concept | Novelty | Recruiter signal | User pull | ML depth | Solo feasibility | $0 to run | 60-sec demo | **Total /35** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **A. Onsite:** adaptive placement test, per-pattern skill map, time-boxed drills, DSA-aware visualizer, structured mocks | 4 | 5 | 4 | 5 | 3 | 5 | 4 | **30** |
| **E. Pattern Rush:** fast pattern-spotting game; Elo for players and items; shareable scores | 4 | 3 | 4 | 3 | 5 | 5 | 4 | **28** |
| **B. TraceLab:** DSA-aware visualizer for your own code, plus a complexity checker | 3 | 3 | 4 | 2 | 4 | 5 | 5 | **26** |
| **C. Local voice interviewer:** voice mock interviews with an in-browser LLM | 4 | 4 | 3 | 3 | 2 | 3 | 5 | **24** |
| **D. Readiness tracker:** LeetCode companion log with knowledge tracing and FSRS | 2 | 3 | 3 | 4 | 5 | 5 | 2 | **24** |

Scores are my judgment (1 = weak, 5 = strong) from the research above. C loses on feasibility and cost because small in-browser LLMs vary by device and are a weak grader. D is solid ML but enters the most crowded niche.

**Recommendation: build A, in an order that ships E first.** Pattern Rush is the smallest deployable slice of A and its most shareable hook. TraceLab becomes A's visual tab in the second phase. Voice from C is the final stretch.

## Spec for Onsite

Onsite finds the patterns you're weakest at in 10 minutes, then spends whatever time you have on exactly those, free, with its ML running in your browser.

**Name ideas** (availability not checked; avoid "Leet", which is LeetCode's mark): Heapify (your weakest topics always on top), Sightread (read any problem at first sight), Argmax (always picks the highest-value next problem), Tells (spot the clues that give a pattern away), Spar (practice rounds before the real fight). "Onsite" stays the working name until you pick.

### Features

| Feature | Tier | Why |
| --- | --- | --- |
| Pattern Spotter drills: name the pattern, pick the complexity, timed mode | MVP | Hits the top pain; smallest shippable slice |
| Skill graph: every topic's mastery and solved counts (Easy, Medium, Hard), shareable image | MVP | The hook people post |
| Session builder: pick 10, 30 or 60 minutes, filled by the weakness-matched recommender (drills + LeetCode links) | MVP | Your flexible-time requirement |
| Local-first progress, no account needed to start | MVP | Zero friction, zero cost |
| Quick log of LeetCode attempts (link + self-rating) | MVP | Feeds the skill map from real practice |
| Visual tab v1: arrays with named pointers, variables, call stack | MVP | The demo GIF |
| Comfort survey: after first sign-in, rate how comfortable you feel with each topic (one tap per pattern, skippable, retake any time) | v2 | Personalizes recommendations from minute one; seeds the placement test; "you rated X 4/5, you measure 38" is a useful insight on its own |
| Placement test (CAT) and periodic re-assessment | v2 | The Duolingo-style diagnosis |
| Original coding problems with tests, structured mock, rubric report | v2 | Interview simulation |
| Visual tab v2: linked lists, trees, DP grid, recursion tree | v2 | Hardest topics to picture |
| FSRS over skills + readiness score | v2 | Retention and "am I ready" |
| Accounts: sign in with GitHub or Google; all progress (answers, sessions, LeetCode logs, recommendation log) synced and kept across devices; signed-out use still works | v2 | Nothing is lost when you switch devices or clear the browser, and synced logs feed calibration and Phase 9 |
| Public /lab page with model cards and metrics | v2 | Recruiter magnet |
| Voice mock mode; in-browser LLM follow-ups; DKT; opt-in leagues; JS views | Stretch | Only after the core is solid |

### Recommendations and skill graph

Every session answers "what should I do next?" by ranking drills and problems against the user's weakest topics and the minutes they have left.

**Skill graph.** Topics sit in layers (foundations, core patterns, data structures, advanced) that suggest an order without locking anything. Each topic node shows mastery 0 to 100 with a confidence band, solved counts by Easy, Medium and Hard, recent accuracy and median time, a "fading" flag when a review is due, and its top recommended item. Clicking a node opens its history: attempts over time, missed items, hint usage.

&#91;embedded content: skill graph · 15 topics in 4 layers\]

Layers suggest an order but every topic stays open; the recommender pulls from whichever nodes are weakest or due.

**What gets recommended.**

| Pool | What's in it | Where it's solved |
| --- | --- | --- |
| In-app items | Pattern and complexity drills, trace and bug items, original coding problems | In the app; outcome recorded automatically |
| LeetCode catalog | Problem slug and link, your pattern tags, zerotrac difficulty rating, membership in public study lists; no problem text | On leetcode.com; the user logs the outcome in one tap |

**Ranking v1 (rules on top of the skill engine).** Each candidate is scored on:

1. **Weakness:** low mastery or high uncertainty on its topics ranks higher.
2. **Difficulty fit:** predicted chance of success in a target band (start at 60 to 75% and tune), so it's hard enough to learn from but not hopeless.
3. **Due reviews:** topics that FSRS marks as due get a boost.
4. **Prerequisites:** if a topic's foundations are weak, recommend the foundation first.
5. **Time fit:** estimated minutes must fit what's left of the session.
6. **Freshness:** skip recently seen items; never repeat a LeetCode problem within a week unless it's a scheduled review.

Each session mixes mostly weakest-topic items, some due reviews and one stretch item. Every card says why it was picked, e.g. "Sliding Window: low mastery, not practiced in over a week."

**Ranking v2 (learned).** Log every recommendation shown, its features and its outcome (solved, time, hint level). Train a contextual bandit or learning-to-rank model whose reward is mastery gained per minute, evaluate it offline by replaying logs against the v1 rules, then A/B test it. This becomes **Model #4** and another resume line.

**Counting solves.** A problem counts once, keeping the best outcome: solved unaided, solved with hints, or solution viewed. Only unaided solves move mastery fully; viewed solutions count toward exposure, not skill.

### Architecture

&#91;embedded content: architecture · browser, Cloudflare, offline\]

Cloudflare only serves static files and stores opt-in responses; the browser runs every model and every line of user code, which is what keeps the bill at $0.

### Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | React + TypeScript + Vite SPA, Tailwind, CodeMirror 6 | Static build, light editor that works on phones |
| Local data | IndexedDB via Dexie | Works offline and without an account |
| Code execution | Pyodide in a Web Worker | $0, safe for you, Python first |
| In-browser ML | Transformers.js 4.x / ONNX Runtime Web; models on Hugging Face Hub | WebGPU with WASM fallback |
| Hosting | [Cloudflare Pages](https://flaviocopes.com/hosting-free-tiers/) | Static requests free and unlimited on every plan |
| API | Cloudflare Workers + Hono | 100,000 requests/day free |
| Database | Cloudflare D1 | Free daily allowance of [5M row reads and 100K row writes](https://eastondev.com/blog/en/posts/dev/20260526-cloudflare-free-limits/); since Sept 1, 2026, over-limit queries [fail instead of billing](https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/) |
| Auth | GitHub and Google OAuth in the Worker (e.g. the Arctic library); session in an HttpOnly, Secure, SameSite=Lax cookie | Both free; your audience already has GitHub, Google covers everyone else. Verify library support for Workers at setup. Email magic links skipped for now: they need a paid or rate-limited email sender |
| Training | PyTorch + Hugging Face on the local RTX 4060 laptop GPU (8 GB, CUDA); Kaggle/Colab free GPUs as fallback; Optimum for ONNX export and int8 | No cloud dependency or quota, browser-ready output |
| Calibration jobs | GitHub Actions cron running Python (py-irt or girth) | Free for public repos; writes item parameters to D1 |
| Domain | A subdomain of erfanzamani.com, or free \*.pages.dev | No extra cost |

Why not Supabase: [free projects pause after 7 days of inactivity](https://www.jetadmin.io/blog/supabase-review/amp/), which breaks a demo link a recruiter clicks weeks later.

### Cost by scale

| Active users | Your monthly cost | First limit you'd hit |
| --- | --- | --- |
| 0 to 100 | $0 | None; nearly all compute is in users' browsers |
| \~1,000 | $0 if you sync once per session | D1's 100K writes/day, about 100 writes per user per day |
| Several thousand daily | \~$5/mo | [Workers Paid](https://costbench.com/software/cloud-infrastructure/cloudflare-pages-workers/free-plan/) is the fallback |

### ML plan

| Model | Data and split | Baseline | Metrics | Serving | Improves with users by |
| --- | --- | --- | --- | --- | --- |
| #1 Pattern classifier | LeetCodeDataset text + topic tags mapped to \~20 interview patterns; train on older problems, test on newest | TF-IDF + logistic regression | Micro and macro F1, per-pattern F1, browser latency | ONNX int8, Transformers.js | User corrections on original items |
| #2 Difficulty predictor | zerotrac ratings joined by slug to text | Mean rating per tag | Spearman rho, MAE | Precomputed priors in D1 | Nightly IRT recalibration replaces priors |
| #3 Complexity classifier | CodeComplex Python split | Paper's baselines | Accuracy + the paper's distance-aware metric | ONNX int8 | Logged disagreements |
| Skill engine | Responses (yours first, then opt-in users) | Fixed-form 20-item test | Items to reach target SE (catsim simulation), Brier score of next-answer predictions | Browser | More responses, tighter item parameters |

### Data model

| Table | Key fields |
| --- | --- |
| users | id, display\_name, settings, created\_at, deleted\_at |
| identities | user\_id, provider (github, google), provider\_user\_id, created\_at |
| auth\_sessions | id, user\_id, expires\_at, created\_at |
| patterns | id, name, layer, prerequisite\_ids |
| items | id, type (pattern, complexity, trace, bug, coding), body\_md, answer, pattern\_ids, est\_seconds |
| item\_params | item\_id, difficulty\_b, discrimination\_a, source (prior or calibrated), updated\_at |
| lc\_catalog | leetcode\_slug, url, pattern\_ids, rating, lists (no problem text) |
| responses | id, user\_id, item\_id, correct, latency\_ms, hint\_level, session\_id, ts |
| lc\_logs | user\_id, leetcode\_slug, outcome (unaided, hints, solution viewed), minutes, ts |
| skill\_state | user\_id, pattern\_id, theta, se, solved\_easy, solved\_medium, solved\_hard, fsrs\_stability, fsrs\_difficulty, due\_at |
| recommendations | id, user\_id, candidate\_ref, features, score, reason, shown\_at, outcome |
| sessions | id, user\_id, minutes\_planned, mode, started\_at, ended\_at |
| self\_ratings | id, user\_id, pattern\_id, rating (1 to 5, or null for "not sure"), params\_version, ts; append-only so retakes keep history |
| mocks | id, user\_id, problem\_id, stage\_scores, rubric, created\_at |

The same schema lives in IndexedDB. Every synced row has a client-generated UUID, a user\_id and an updated\_at, so sync is an idempotent upsert and two devices never collide on ids. The client pushes new and changed rows at the end of each session (and when it comes back online), and pulls rows changed since its last sync on startup.

### Engineering quality signals

- Unit tests for Elo, IRT and CAT math checked against catsim outputs; Vitest; Playwright end-to-end tests for a drill and a mock
- Golden tests for the tracer: known programs produce known step snapshots
- CI on every push: lint, typecheck, tests, build, a performance budget, and a small model-eval fixture
- Observability: Workers analytics, structured logs, client error reporting
- Public /lab page: model cards (data, splits, metrics, limits, license notes), CAT simulation plot, calibration curve
- Security: user code runs only in their browser worker; content security policy; API rate limits; every API query scoped to the signed-in user; no PII beyond the provider's user id and a display name (no email stored); account deletion removes all server rows

### How to present it

- **README:** one-line pitch and demo GIF, live link, how-it-works diagram, ML results table, architecture, local setup, model cards, roadmap
- **Demo video (60 to 90 s):** placement test, skill map, a drill, the visualizer on a DP problem, a mock report
- **Blog post:** "A Duolingo-style adaptive test for coding interviews on $0 of infrastructure"
- **Resume bullets** (bracketed numbers are targets to measure, not facts yet):
  1. Built and deployed Onsite, a free interview-prep web app (React, TypeScript, Cloudflare) running ML fully in-browser via ONNX and WebGPU; \[N\] users in \[M\] weeks
  2. Fine-tuned a multi-label pattern classifier on 2.8K problems with a temporal split, reaching \[X\] macro-F1 vs a \[Y\] TF-IDF baseline, served int8 at \[Z\] ms in-browser
  3. Designed an IRT adaptive test that estimates per-pattern skill in \[K\] items, \[P\]% fewer than a fixed form in simulation, using text-predicted difficulty priors (Spearman \[R\])

### Launch and growth

- **Where:** r/leetcode and r/cscareerquestions (read self-promotion rules first), Show HN, Product Hunt, GDG McMaster, CS Discord servers, a LinkedIn post with the demo GIF
- **Shareable:** skill-map card image, mock report link, Pattern Rush score challenge
- **Retention:** weekly goal, earned streak freezes, "fading skill" nudges, an end-of-session "next 10 minutes" suggestion
- **Success metrics:** placement completion rate, D7 and D30 retention, sessions per user per week, Brier score of the skill model, total users

### Risks

| Risk | Mitigation |
| --- | --- |
| LeetCode terms and copyright | Original content, link-out only, no scraping |
| Cold-start item calibration | Text-predicted priors, simulation study, nightly recalibration |
| Writing enough items | Item templates; start with 12 patterns x 10 items; Claude-assisted authoring at build time with your review |
| Low-end devices | int8 models, lazy loading, WASM fallback, every model optional |
| Scope creep | Each phase ends in a working app |
| Free-tier changes | Hard caps that fail closed, batched writes, offline-capable client |
| Weak small-LLM output | It never grades; scoring stays deterministic |
| Seen as a cheating tool | No real-time interview assistance, ever |
| Holding user accounts and progress | Store only provider id and display name; per-user scoping on every query; account deletion and full export; privacy note on the sign-in page |
| Sync conflicts or lost progress across devices | Client UUIDs, idempotent upserts, append-only logs (answers and LeetCode logs are never edited in place), two-device end-to-end test |

## Build plan

Nine phases, each ending in a working app you can demo locally. Deployment is Phase 8, and Phase 9 re-estimates the hand-set weights from real usage. There's no fixed timeline, so move to the next phase only when the current one's "done" check passes.

**Working agreement:** Claude writes, runs and tests code and hands over the files, but never commits or pushes anything. Erfan reviews every change and does all commits and pushes to GitHub himself.

### Phases

1. **Foundations.** Goal: a working local setup on day one.
   - Monorepo with apps/web, apps/api, ml, content; Vite + React + TS + Tailwind; public GitHub repo with CI for lint, typecheck, tests.
   - Done: the app runs locally and CI passes on every push.
2. **Pattern Rush MVP (first usable version).** Goal: the smallest useful slice.
   - Pattern taxonomy (\~14 patterns to start), item YAML schema, 120 original pattern and complexity items.
   - Drill screen, timed mode, 10/30/60-minute session builder, IndexedDB storage, quick LeetCode log.
   - ML: per-pattern and per-item Elo, unit-tested. Skill graph with solved counts and a shareable image; rule-based recommender for drills and LeetCode links.
   - Every tunable number lives in one versioned `engine/params.ts`, and every drill pick and in-session LeetCode task is logged with its features, runner-up scores, tie-break noise and outcome (the data Phase 9 learns from). JSON export of all local data.
   - Done: a few days of your own use to catch friction; the numbers themselves are tuned from data in Phase 9. Show: skill-graph screenshots in the README.
3. **Visual tab.** Goal: the demo GIF.
   - Pyodide worker, settrace tracer with step cap, copied snapshots, timeout kill.
   - Views: array with named pointers, variables, call stack; then linked list, tree, DP grid, recursion tree. Golden tests.
   - Done: your own NeetCode-style solutions trace correctly. Show: a 20-second GIF of a DP grid filling.
4. **Model #1 + /lab.** Goal: the first trained model inside the app.
   - Map tags to patterns, temporal split, TF-IDF baseline, fine-tune, evaluate, export ONNX int8, publish on Hugging Face with a model card.
   - Use it for "signal phrase" feedback in drills, auto-tagging items, and picking the default visualizer view.
   - Done: metrics and browser latency on /lab. Show: the model card.
5. **Placement test + backend.** Goal: the Duolingo-style diagnosis.
   - Model #2 difficulty priors; Rasch/2PL, max-information selection and a standard-error stop rule in TypeScript; catsim simulation comparing adaptive vs fixed form.
   - Workers + D1, built and tested locally with wrangler dev; calibration script (scheduled nightly after deploy).
   - Accounts: sign in with GitHub or Google, sign out, link a second provider to the same account, delete account (removes every server row), download all data.
   - Sync of everything: responses, sessions, LeetCode logs and the recommendation log. Local rows get UUIDs (a Dexie migration from today's auto-increment ids); push at session end and on reconnect, pull on startup; idempotent upserts, last write wins by updated\_at.
   - First sign-in on a device that already has local progress asks whether to merge it into the account, so nothing practiced before signing up is lost. Signed out, the app keeps working fully offline as today.
   - Comfort survey right after first sign-in (when the account has no ratings yet): one screen, every pattern with a 5-point scale (1 never seen it, 2 know the idea, 3 can solve easy ones, 4 can solve mediums, 5 comfortable with hards) plus "not sure"; skippable, retake from settings. Signed-out first-time users get the same survey, also skippable.
   - Ratings become each pattern's prior: rating maps to a starting theta (v1 mapping hand-set in params.ts, e.g. 1 to -1.5 up to 5 to +1.5), with the prior SD kept wide so real answers override a wrong self-assessment within a few items. Skipped or "not sure" keeps today's neutral prior. The skill graph shows self-rating next to measured mastery and flags big gaps.
   - Tests: auth flow and session-cookie handling in the Worker, sync merge and conflict cases, a two-device Playwright test (progress made on one appears on the other).
   - Done: placement finishes in 10 minutes or less; progress made signed in on one browser shows up on another; simulation plot on /lab. Show: "finds weak areas in K items."
6. **Coding problems + structured mock.** Goal: interview simulation.
   - 30 original problems with tests and hint ladders; Model #3 complexity classifier; staged mock with rubric report and share link.
   - Done: you complete 5 mocks. Show: a report screenshot.
7. **Retention and polish.** Goal: launch-ready.
   - FSRS over skills, fading-skill nudges, weekly goals, readiness score, learned recommender (Model #4) once logs exist; performance, accessibility, mobile.
   - Done: a friend finishes placement, a session and a mock on a phone without help.
8. **Deploy and launch.** Goal: a live link and real users.
   - Cloudflare Pages, Workers and D1 in production; subdomain of erfanzamani.com; nightly calibration on; error reporting.
   - Launch posts per the spec; collect retention and model metrics for the README and resume.
9. **Re-estimation from usage.** Goal: replace every hand-set weight with one learned from real data.
   - Inputs: synced responses, LeetCode logs and the recommendation log (plus your own pre-launch JSON export), each row tagged with the params version that produced it.
   - Elo learning rates and prior SD: grid or gradient search minimizing the Brier score of next-answer predictions on a time-based holdout.
   - LeetCode difficulty priors and outcome scores: fit to logged outcomes by maximum likelihood.
   - Survey mapping: fit the self-rating to starting-theta mapping (and how much to trust it, i.e. its prior SD) against the mastery each user later measures; tells you whether people over- or under-rate themselves per pattern.
   - Recommender weights and target band: off-policy evaluation of candidate params against the v1 rules, using the logged runner-up scores and noise to recover selection propensities; the reward is mastery gained per minute. Feeds Model #4.
   - Ship each result as a new `params.ts` version; A/B test against the previous version before switching everyone.
   - Done: a params version learned from data beats v1 on held-out Brier score and on offline reward. Show: a before/after calibration plot and the learned-vs-guessed weight table on /lab.
   - Stretch afterwards: voice mode, in-browser LLM follow-ups, DKT, leagues, JS views.

### Repo structure

```
onsite/
  apps/
    web/                  Vite + React + TS
      src/features/       drills, placement, visualizer, mock, skillmap, sessions
      src/engine/         elo.ts, irt.ts, cat.ts, fsrs.ts (pure, tested)
      src/ml/             ONNX model loaders
      src/workers/        pyodide.worker.ts, tracer.py
      src/db/             Dexie schema
    api/                  Cloudflare Worker (Hono) + D1 migrations
  ml/
    notebooks/            Kaggle/Colab notebooks
    src/                  train_*.py, export_onnx.py
    eval/                 metrics, CAT simulation
    model_cards/
  content/
    patterns.yaml
    items/                one YAML file per item
    problems/<slug>/      statement.md, tests.py, solution.py, hints.yaml
  .github/workflows/      ci.yml, calibrate.yml
```

### Key libraries

| Package | Version | Use |
| --- | --- | --- |
| @huggingface/transformers | 4.3.0 (Sept 2026, [source](https://pinggy.io/blog/run_llm_in_browser_webgpu/)) | In-browser models |
| @mlc-ai/web-llm | 0.2.85 (Sept 2026, same source) | Optional LLM, stretch only |
| pyodide, ts-fsrs, dexie, react, vite, tailwindcss, @codemirror/\*, d3-hierarchy, hono, drizzle-orm, vitest, @playwright/test | Pin latest at setup (not verified here) | App and API |
| torch, transformers, datasets, optimum\[onnxruntime\], scikit-learn, catsim, py-irt or girth | Pin latest at setup | Training, export, calibration |

### Free setup: local now, deploy last

**Now (local, free):**

1. Create a public GitHub repo (public keeps Actions free and doubles as portfolio).
2. Install Node, pnpm, Python and wrangler; run the web app with Vite, and the Worker with a local D1 via wrangler dev.
3. Create a Hugging Face account and public model repos for the ONNX files.
4. Train on the local GPU (RTX 4060, 8 GB) from ml/.venv (see ml/requirements.txt); Kaggle or Colab free GPUs are the fallback.
5. Register development OAuth apps with localhost callback URLs: a GitHub OAuth app and a Google OAuth client (Google Cloud console, free). Their secrets go in apps/api/.dev.vars, never in VITE\_\* variables.

**Final phase (deploy):**

1. Create a free Cloudflare account and a Pages project linked to the repo; build the web app; output apps/web/dist.
2. Create the production D1 database and Worker; bind D1 in wrangler config; run migrations.
3. Point a subdomain of erfanzamani.com at the Pages project with a CNAME record.
4. Register production GitHub and Google OAuth apps with the live callback URL; store their secrets as Worker secrets (wrangler secret put).
5. Add the Cloudflare API token and IDs as GitHub Actions secrets, then turn on nightly calibration.

### Model training workflow

1. Data prep script writes versioned parquet files with fixed splits.
2. Baseline notebook records metrics.json.
3. Fine-tune on a free GPU; save the checkpoint.
4. Eval script: overall and per-pattern metrics, confusion matrix, error examples.
5. Export to ONNX, quantize to int8, check outputs match the original within tolerance, check file size.
6. Publish to Hugging Face with a model card; copy metrics.json into the /lab page.
7. A browser benchmark page measures latency on WebGPU and WASM.

### Testing and CI/CD

- **ci.yml** on every push and PR: install, lint, typecheck, Vitest, build, Playwright smoke test on a local production build.
- **Engine tests:** Elo, IRT and CAT unit tests, plus a Python test comparing your CAT simulation against catsim.
- **Tracer golden tests:** known programs produce known step snapshots.
- **calibrate.yml** nightly once deployed: read new responses from D1, refit item parameters, write them back.
- After the deploy phase, Cloudflare Pages deploys main automatically, with a preview URL per PR.

### Day one: first 5 tasks

- [ ] Create the public `onsite` repo with the monorepo skeleton and a README stub
- [ ] Scaffold apps/web (Vite + React + TS + Tailwind), run it locally, and get CI passing on GitHub
- [ ] Write content/patterns.yaml (\~14 patterns) and the item schema, then 20 original pattern-spotting items
- [ ] Build the drill screen: show an item, pick a pattern, instant feedback, save the response to IndexedDB
- [ ] Implement per-pattern Elo with unit tests, render the skill graph with solved counts, and ship v0.1

## Sources

Pricing and limits come from 2026 pages and change often; recheck before relying on a number.

- Competitors: [LeetCode Premium listing](https://www.techinterview.org/bootcamp_directory/p/leetcode-premium/), [LeetCode release notes](https://leetcode.com/discuss/post/5736503/), [NeetCode Pro listing](https://www.techinterview.org/bootcamp_directory/p/neetcode-pro/), [AlgoExpert pricing comparison](https://www.lodely.com/blog/algoexpert-pricing), [interviewing.io listing](https://www.techinterview.org/bootcamp_directory/p/interviewing-io/), [AI interview prep tools 2026](https://fast.io/resources/best-ai-interview-prep-tools-2026/), [AI interview assistants](https://hedy.ai/post/best-ai-interview-assistant-tools/), [Online Python Tutor paper](https://research.google/pubs/pub40591/), [Leetcode Anki](https://addons.mozilla.org/en-US/firefox/addon/leetcode-anki/), [dsaprep.dev Show HN](https://hn.svelte.dev/item/45436942), [LeetCode Recall Tracker](https://github.com/vittorio-centore/leetcode-tracker), [Interview Pattern Trainer](https://github.com/FrancisTRdev/swe-interview-practice)
- Pain points: [Blind: hitting a wall](https://www.teamblind.com/post/feel-like-im-hitting-a-wall-with-leetcode-dspwtyww), [froze on problem 201](https://levelup.gitconnected.com/i-solved-200-leetcode-problems-and-froze-on-problem-201-d3d3deb1282f), [r/leetcode OA post](https://red.127.pp.ua/r/leetcode/comments/1lcyzgn/struggling_to_improve_at_oas), [DP visual learning comment](https://reactjava.substack.com/p/why-bytebytego-is-best-place-to-learn/comments), [linked list visualizer](https://dev.to/rushedcomet/stop-debugging-by-hand-i-built-a-real-time-linked-list-visualizer-2hjm)
- ML and data: [LeetCodeDataset](https://huggingface.co/datasets/newfacade/LeetCodeDataset), [LeetCodeDataset overview](https://alphaxiv.org/benchmarks/ieee/leetcodedataset), [CodeComplex paper](https://arxiv.org/abs/2401.08719v2), [CodeComplex repo](https://github.com/sybaik1/CodeComplex), [zerotrac ratings](https://github.com/zerotrac/leetcode_problem_rating), [company-wise rating merge](https://github.com/bluebread/leetcode-company-wise-rating), [Code-DKT](https://cs.paperswithcode.com/paper/code-dkt-a-code-based-knowledge-tracing-model), [programming KT re-evaluation](https://arxiv.org/pdf/2605.04727), [Open Spaced Repetition / FSRS](https://github.com/open-spaced-repetition), [catsim](https://github.com/douglasrizzo/catsim)
- Duolingo: [half-life regression blog](https://blog.duolingo.com/how-we-learn-how-you-learn), [DET scoring](https://blog.englishtest.duolingo.com/how-is-the-duolingo-english-test-scored/), [Machine Learning Driven Language Assessment (TACL)](https://transacl.org/index.php/tacl/article/view/1743), [DET question types](https://www.timeshighereducation.com/student/blogs/what-questions-can-students-expect-duolingo-english-test), [streak research summary](https://thedecisionlab.com/fr-CA/insights/consumer-insights/streak-creep-the-perils-of-too-much-gamification), [Duolingo growth summary (secondary)](https://nl.linkedin.com/in/ervin-dobri)
- Browser runtime: [WebGPU across browsers](https://app.cinevva.com/guides/webgpu-vs-webgl-games), [LLMs in a browser tab, 2026](https://pinggy.io/blog/run_llm_in_browser_webgpu/), [Moonshine Web](https://huggingface.co/spaces/moeru-ai/moonshine-web-vue/blob/f579272a432583a6824cbc25b5a4121f74ddb781/README.md), [Qwen2.5-Coder-1.5B MLC build](https://huggingface.co/bernardw/qwen2.5-coder-1.5b-codereview-taid-q4-mlc), [Code Visualizer (Pyodide + settrace)](https://github.com/harsit14/code_visualizer), [live-py-tutor](https://github.com/livinNector/live-py-tutor), [Pyodide pitfalls](https://dev.to/viramchoksi/four-things-that-surprised-me-running-python-in-the-browser-4lci)
- Interviews: [Google-style rubric](https://prepfully.com/interview-guides/google-software-engineer-coding-interview), [Tech Interview Handbook signals](https://www.techinterviewhandbook.org/coding-signals/)
- Hosting: [free tiers compared](https://flaviocopes.com/hosting-free-tiers/), [Cloudflare free limits](https://eastondev.com/blog/en/posts/dev/20260526-cloudflare-free-limits/), [D1 limit enforcement](https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/), [Workers plans](https://costbench.com/software/cloud-infrastructure/cloudflare-pages-workers/free-plan/), [Supabase review](https://www.jetadmin.io/blog/supabase-review/amp/)
- Legal: [LeetCode Terms of Service](https://leetcode.com/terms), [LeetCode DMCA notice](https://git.randommeaninglesscharacters.com/github/dmca/commit/2aefe88f5767e87d59596d2156f543a34b7334ce)
