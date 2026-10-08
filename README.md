# algorithm-finder

**Describe a computational problem and get back the algorithms that fit, why
they fit, the bounds cited to the page, and where to get an implementation.**

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1743+ live data sources. This is an independent, unofficial integration — not affiliated with, endorsed by, or published by the upstream provider.

By [Mojibake](https://pipeworx.io), creators of Pipeworx.

Ask it "all-pairs shortest paths" and it does not guess. It looks up the
textbook answer (Floyd-Warshall, Johnson's, the precondition that decides
between them, cited to the exact page of CLRS), checks the last five years of
arXiv and Hugging Face Papers for anything newer, and tells you what it does
not know yet. No model runs in the request path. Every fact is either a
citation or a live source, never a guess.

## Three things it actually returned

These are real calls against the live pack, trimmed for length. Nothing below
is invented.

### 1. "What solves all-pairs shortest paths?"

```
algorithm_find({ problem: "all-pairs shortest paths", want: "both" })
```

Two methods, correctly separated by the constraint that actually decides
between them:

```json
{
  "name": "Floyd-Warshall algorithm",
  "preconditions": ["Negative edge weights are allowed, but there must be no negative-weight cycle."],
  "guarantee": "exact",
  "bounds": [
    { "quantity": "time", "bound": "Theta(V^3)", "kind": "worst_case",
      "cite": "CLRS4 ch. 23.2 p. pdf:851" }
  ],
  "when_to_use": "All-pairs shortest paths on dense graphs, or whenever its simple triple-loop implementation (no priority queue needed) is worth the cubic cost.",
  "when_not": "On sparse graphs, Johnson's algorithm has a better asymptotic bound.",
  "alternatives": ["Johnson's algorithm", "Dijkstra's algorithm", "Bellman-Ford algorithm"]
},
{
  "name": "Johnson's algorithm",
  "preconditions": ["No negative-weight cycle (checked by the initial Bellman-Ford run)."],
  "guarantee": "exact",
  "bounds": [
    { "quantity": "time", "bound": "O(V^2 lg V + VE)", "kind": "worst_case",
      "cite": "CLRS4 ch. 23.3 p. pdf:857" }
  ],
  "when_to_use": "All-pairs shortest paths on sparse graphs with some negative edge weights -- asymptotically faster there than Floyd-Warshall's Theta(V^3)."
}
```

It also names the open questions that would change the answer, before you ask:

```json
"open_questions": [
  "Can any edge weight be negative? (Dijkstra requires non-negative weights; Bellman-Ford does not.)",
  "One source, or every pair of vertices?",
  "Are capacities integral? Is there a cost per unit of flow to minimise as well?"
]
```

...plus five recent, dated papers on the "novel" side, including *Warm-Starting
All-Pairs Shortest Paths with Predictions* (arXiv, 2026) and *Fast 2-Approximate
All-Pairs Shortest Paths* (arXiv, 2023).

### 2. "What's new in approximate nearest neighbor search?"

```
algorithm_find({ problem: "approximate nearest neighbor search", want: "novel" })
```

This is the pure research leg, no textbook entry involved. It does not just
list papers; it clusters method names across them so a recurring name reads as
a real answer rather than a title you have to notice yourself:

```json
"novel_methods": [
  {
    "name": "HNSW",
    "mentions": 8,
    "first_seen": 2022,
    "last_seen": 2026,
    "example_paper": {
      "title": "From HNSW to Information-Theoretic Binarization: Rethinking the Architecture of Scalable Vector Search",
      "date": "2025-12-16T23:24:37.000Z",
      "url": "https://huggingface.co/papers/2601.11557"
    }
  },
  { "name": "NSG", "mentions": 6, "first_seen": 2017, "last_seen": 2025 },
  { "name": "SPANN", "mentions": 2, "first_seen": 2021, "last_seen": 2025 }
]
```

HNSW surfaces on its own, from the research, with the count and date range
that make it a real signal rather than a single paper's opinion.

### 3. "CP-SAT, MIP or a flow formulation for fair shift scheduling?"

```
algorithm_compare({
  problem: "assign people to shifts with availability and skills, minimum staffing per shift, and distribute undesirable shifts fairly",
  names: ["constraint-programming", "mixed-integer-programming", "min-cost-flow"],
  constraints: { objective: "fairness", exact: true }
})
```

Every constraint you state gets a verdict per method, and every restriction
you did not state comes back as an assumption rather than a silent yes:

```json
{
  "verdict": "conditional",
  "winner": "Constraint programming (CP-SAT)",
  "summary": "Constraint programming (CP-SAT), IF continuous_variables is false.",
  "candidates": [
    { "name": "Constraint programming (CP-SAT)",
      "constraints": { "objective": { "status": "satisfied", "given": "fairness" },
                       "exact":     { "status": "satisfied", "given": true } },
      "assumes": [{ "constraint": "continuous_variables", "requires": [false],
        "why": "CP-SAT requires every decision variable to be declared as an integer; it has no native continuous-variable type the way an LP/MIP solver does." }] },
    { "name": "Mixed-integer programming",
      "constraints": { "objective": { "status": "unknown", "given": "fairness" } },
      "assumes": [{ "constraint": "linear", "requires": [true] }] },
    { "name": "Minimum-cost flow (successive shortest paths)",
      "constraints": { "objective": { "status": "unknown", "given": "fairness" } },
      "assumes": [{ "constraint": "integer_capacities", "requires": [true] }],
      "bounds": [{ "bound": "O(F*m*n)", "kind": "worst_case",
                   "cite": "Minimum-cost flow, Complexity <https://cp-algorithms.com/graph/min_cost_flow.html>" }] }
  ],
  "open_questions": [
    "How should fairness be measured: equal counts of undesirable assignments, minimise the worst-off person, or minimise variance? Each is a different objective.",
    "Do you need a provably optimal schedule, or is a good feasible one enough? (CP-SAT/MIP can prove optimality; heuristics only find feasible answers.)",
    "Are any rules hard (must hold) versus soft (preferences with a penalty)?"
  ]
}
```

It does not claim the flow formulation fails on fairness. It says it does not
know, and asks the question that would settle it. A key it has no rule for
(say `gpu_available`) is rejected by name with the list of keys it does
understand, never quietly marked satisfied.

## Install

### Hosted (no setup)

```json
{
  "mcpServers": {
    "algorithm-finder": {
      "url": "https://gateway.pipeworx.io/algorithm-finder/mcp"
    }
  }
}
```

This endpoint also carries the shared Pipeworx meta-tools (`ask_pipeworx`,
`discover_tools`, and friends), so you can ask in plain English instead of
calling a tool directly:

```
ask_pipeworx({ question: "what algorithm solves the assignment problem?" })
```

### Local (no account, no network dependency on us)

```json
{
  "mcpServers": {
    "algorithm-finder": {
      "command": "npx",
      "args": ["-y", "@pipeworx/mcp-algorithm-finder"]
    }
  }
}
```

Available once published. Same source, same four tools, no gateway
round-trip and none of the shared meta-tools.

## Why trust it

- **Every fact is in our own words, cited to a page.** The curated method
  table (`data/methods.json`) states what a method solves, its preconditions,
  its bounds (worst-case, expected, or amortized -- never collapsed into one
  number), when to use it and when not, and names the book and chapter the
  fact was read from: CLRS 4th ed., Erciyes's *Guide to Graph Algorithms*,
  Christian & Griffiths's *Algorithms to Live By*, Bhargava's *Grokking
  Algorithms*. No sentence, figure, or code from any of those books is served
  -- only facts established from them, restated.
- **An uncited bound is refused, not shipped.** The bake script that builds
  this table rejects any non-qualitative complexity bound with no page
  citation attached. A bound you cannot point at a page for comes back
  labelled `qualitative`, never dressed up as a number.
- **Implementations are labelled for what they are.** Every code sample
  carries `grade: "educational"` -- it is Rosetta Code's reference solution,
  not a production-tested package. There is no `application` grade yet;
  nothing has been tested against pinned dependencies.
- **Licenses travel with the data, not just in this README.** NIST's
  Dictionary of Algorithms and Data Structures is a work of the US
  government and is public domain (17 U.S.C. § 105). Rosetta Code and
  cp-algorithms are CC BY-SA 4.0 -- every response from those sources carries
  the attribution line and the share-alike obligation inline, so you see the
  terms at the point you use the data, not buried in a license file.

## Contributing

Two ways in: add a method, or add a test case. A method goes in
`data/methods.json` and needs a real citation (book, chapter and page, or a
paper or official library doc) for every bound you add; the build refuses an
entry that names a complexity with no citation behind it. A test case goes in
`data/harness.json`: a problem, optionally the candidates and constraints, and
the answer it should produce. Cases that fail today are the most useful ones,
because they are what gets fixed next. Either way, point at a source. No
source, no merge.

## Reference

## Tools

- `algorithm_find(problem, want?, since_year?, limit?)` — describe the problem
  in words and get the matching textbook methods (what each solves,
  preconditions, bounds with their kind — worst-case / expected / amortized —
  when to use and when not, alternatives, citations), the open questions whose
  answers decide between them, Skiena Algorithm Repository problem pages, and
  recent papers from Hugging Face Papers and arXiv. `want` is `common`,
  `novel` or `both` (default). Optional `constraints` (same keys as
  `algorithm_compare`) move textbook results that violate one to the end and
  add a per-constraint `fit` to each.
- `algorithm_compare(names? | problem?, constraints)` — state facts about
  your instance (`{"negative_weights": true, "query": "single_source"}`,
  `{"stable": true}`, `{"exact": false, "dimensions": "high"}`) and each
  candidate gets **satisfied / violated / unknown** per constraint, read from
  the curated table. Returns a `verdict` — `recommended`, `conditional` (the
  best candidate has constraints the table says nothing about, named),
  `none_compatible`, or `no_constraints` — the winner, each candidate's bounds
  and when-not advice, and `decisive_questions`: constraints you did not state
  that would rule candidates in or out. A restriction a method has that you
  did not state (DAG shortest paths needs `acyclic: true`) is listed under
  `assumes` and makes the verdict `conditional`; methods needing fewer
  assumptions rank first, so a special-case method never wins on a fact you
  did not give. Keys and values are fixed by
  `data/constraints.json`; an unknown key or value is returned in
  `constraints_rejected`, never silently ignored.
- `algorithm_lookup(name)` — one named method in full: the curated facts, the
  NIST DADS dictionary entry (definition, aliases, relations, complexity note,
  implementation links), the cp-algorithms article, related problem pages, and
  which languages Rosetta Code has solutions in. Short names and aliases work
  (`Dijkstra`, `KMP`, `union-find`).
- `algorithm_implementations(name, language?)` — the languages Rosetta Code has
  solutions in and, with `language`, that solution's source code (CC BY-SA
  4.0, labelled `educational`), plus reference links from the DADS entry, the
  cp-algorithms article and the Algorithm Repository's implementation links.

Every response carries `data_as_of` (the newest DADS entry-modified date in
the index), a `license` block for the leading source, and a source URL per
item. A miss is `found: false` with a `reason` (`no_match`,
`language_not_present`) and a `hint` naming what to try; a transport or parse
failure throws rather than returning an empty list.

### Auth

Keyless.

### Data sources

- <https://xlinux.nist.gov/dads/> — NIST Dictionary of Algorithms and Data
  Structures (Paul E. Black, ed.). ~1,120 entries. A work of the United States
  Government, not subject to copyright (17 U.S.C. § 105). The whole entry set
  is in the generated index (`src/af-index-data.ts`, rebuilt by
  `scripts/bake-algorithm-finder-index.mjs`).
- `data/methods.json` — a curated table written for this pack: for each
  method, what it solves, preconditions, bounds (with kind and conditions),
  when to use and when not, alternatives, phrasings of the problem in everyday
  words, citations, a `tier` (`core` / `common` / `specialized`), a
  `family_rank` (first choice within its family when its constraints hold)
  and `constraints` (the values of each vocabulary key the method accepts,
  with why). Facts were established from Cormen, Leiserson, Rivest &
  Stein, *Introduction to Algorithms* 4th ed. (`CLRS4`); Erciyes, *Guide to
  Graph Algorithms* 2nd ed. (`Erciyes2026`); Bhargava, *Grokking Algorithms*
  (`Grokking2024`); Christian & Griffiths, *Algorithms to Live By* (`ATLB`),
  and, for methods the books do not cover (HNSW, MinHash, Bloom filters,
  consistent hashing, A*, CP-SAT and others), from the original papers and
  official library documentation, each citation carrying the URL read. All of
  it is stated in our own words. No book or paper text is served. The bake script
  refuses any non-qualitative bound that lacks a page citation.
- <https://www.algorist.com/> — Steven Skiena's Stony Brook Algorithm
  Repository. Only the 75 problem names, categories and URLs are in the index;
  a problem page is fetched per call for its input/problem statement and
  implementation links, and attributed.
- <https://cp-algorithms.com/> — titles, locations and tags from its own
  search index; an article's opening paragraphs are fetched per call. CC BY-SA
  4.0, attributed in the response.
- <https://rosettacode.org/w/api.php> — MediaWiki API. A task page is resolved
  with `list=search`; its per-language solutions are level-2 sections
  (`action=parse&prop=sections`), and one section's wikitext yields the code
  inside `<syntaxhighlight lang="…">`. CC BY-SA 4.0, attributed. Note:
  `list=categorymembers` on a task name returns an empty list — solutions are
  sections of the task page, not category members.
- <https://huggingface.co/api/papers/search> — Hugging Face Papers, the
  successor to Papers with Code (whose API now redirects there). Abstracts are
  read so method names can be mined from them.
- <https://export.arxiv.org/api/query> — arXiv Atom API, restricted to cs.DS /
  cs.CC / cs.DM / cs.LG / cs.IR / cs.NE / cs.DB, relevance order. Both research
  sources are called directly, so the pack has no dependency on other packs.
- `data/constraints.json` — the constraint vocabulary. `data/harness.json` —
  the acceptance cases for `algorithm_compare`, run by `src/compare.test.ts`,
  which also corrupts a table fact and requires the harness to fail.

### Known vocabulary gaps

Writers reported facts the constraint vocabulary cannot yet express, so those
methods answer `unknown` on them: graph connectivity (Hierholzer), whether the
cluster count is known (DBSCAN vs k-means), fault model (Raft/Paxos crash vs
Byzantine), range-aggregate type (Fenwick vs segment tree vs sparse table),
coordinates vs distance-only (kd-tree vs vp-tree), divisible items (fractional
vs 0-1 knapsack), matrix well-posedness (LU, least squares), prior family
(Bayesian prediction rules), discount rate (Gittins index), player count
(game theory). Add a key to `data/constraints.json`, annotate, and add a
harness case.

### Traps worth knowing

- DADS lists a term under every alias in `terms.html` (1,309 names for ~1,120
  entries); aliases come from that index, not only from "Also known as".
- A DADS complexity lives in the free-text *Note*, not a field; the bake
  extracts `O(…)` / `Θ(…)` expressions into `bounds_mentioned` but they carry
  no variant or conditions — the curated table is where that precision lives.
- The curated-table bound for a method names its variant (binary heap vs
  Fibonacci heap; expected vs worst case). Do not collapse them.
- Rosetta language section names are the wiki's spelling (`C++`, `C#`,
  `Icon and Unicon`); the `language` argument matches case-insensitively on
  the whole name or a prefix.

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "algorithm-finder": {
      "url": "https://gateway.pipeworx.io/algorithm-finder/mcp"
    }
  }
}
```

### What this endpoint actually serves

`tools/list` at `https://gateway.pipeworx.io/algorithm-finder/mcp` returns the tools in the table
above **plus the shared Pipeworx meta-tools** — `ask_pipeworx`,
`discover_tools`, `search_within`, `remember`/`recall` and the rest of the
gateway-wide set. So the tool count you see is larger than this table: a
single-pack endpoint currently lists roughly 30 shared tools alongside the
pack's own. The connection's `initialize` response states its exact scope, and
is the authoritative answer for a given day.

This is deliberate, not multiplexing by accident. The meta-tools are what let a
scoped connection answer a question this pack does not cover — via
`ask_pipeworx`, which routes across the whole catalog — without you adding a
second MCP server. There is currently no way to mount a pack endpoint without
them; if the extra schemas cost you more context than the routing is worth,
connect to the full gateway once rather than to several pack endpoints.

Or connect to the full Pipeworx gateway to get every pack's tools listed
directly, instead of just this one's:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

Both URLs reach the same gateway and the same 1743+ data sources. The
only difference is which pack's tools are listed **directly**; `ask_pipeworx`
reaches all of them from either one.

## No MCP client? Call it over HTTP

```bash
curl -X POST https://gateway.pipeworx.io/v1/tools/algorithm_find \
  -H 'Content-Type: application/json' \
  -d '{"problem":"all-pairs shortest paths","want":"both"}'
```

No account needed for the first calls. Inspect any tool: `GET https://gateway.pipeworx.io/v1/tools/algorithm_find`. Find one: `POST https://gateway.pipeworx.io/v1/tools/search_packs` with `{"query":"..."}`.

## Standalone (no gateway account)

This package also runs as a local stdio MCP server — no Pipeworx account, no
gateway round-trip:

```json
{
  "mcpServers": {
    "algorithm-finder": {
      "command": "npx",
      "args": ["-y", "@pipeworx/mcp-algorithm-finder"]
    }
  }
}
```

Or run it directly to confirm it starts:

```bash
npx -y @pipeworx/mcp-algorithm-finder
```

It speaks MCP over stdin/stdout and answers `initialize`/`tools/list`/`tools/call`
for **only** this pack's tools — none of the shared meta-tools the gateway
connection above adds. Same source, same tools, no ask_pipeworx routing.

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English —
this works on the pack endpoint above as well as on the full gateway:

```
ask_pipeworx({ question: "your question about Algorithm Finder data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
