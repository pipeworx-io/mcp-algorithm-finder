interface McpToolDefinition {
  name: string;
  description: string;
  /** Human-facing one-liner (fleet #1967). Optional; consumers fall back to
   *  description. Kept in step with shared/src/types.ts — scripts/lib/
   *  check-inlined-types.mjs reports drift at publish time. */
  summary?: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    anyOf?: Array<{ required: string[] }>;
    oneOf?: Array<{ required: string[] }>;
    allOf?: Array<{ required: string[] }>;
  };
  outputSchema?: Record<string, unknown>;
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * Legal authority typing and the age-labelling contract.
 *
 * Phase 0 of docs/secondary-legal-sources-plan.md (fleet #1970). This is the
 * SHARED shape that 14 federal secondary-legal source packs key on, so it is
 * defined once here rather than retrofitted across 14 packs later.
 *
 * WHAT THIS IS FOR. The product claim is that an agent asking a legal question
 * can rank what it gets back — controlling authority above the issuing agency's
 * own reading of its rule, that above a practitioner manual, that above a law
 * review article, that above a 1910 treatise. No free legal tool does this. The
 * ranking is only possible if every pack labels its documents with the same
 * vocabulary, which is what `AUTHORITY_TYPES` and `BINDING_STATUSES` are.
 *
 * THE TWO AXES ARE NOT THE SAME AXIS, and conflating them is the mistake this
 * file exists to prevent:
 *
 *   authority_type  — what KIND of instrument this is. A property of the
 *                     document. Stable forever. A repealed statute is still a
 *                     statute.
 *   binding_status  — what FORCE it carries. Changes over time (a rule is
 *                     proposed, then binding, then vacated) and is the axis
 *                     `superseded_by` hangs off.
 *
 * A single "authority level" field cannot express "an agency manual that its own
 * staff must follow but which binds no court", and that describes the IRM, the
 * Justice Manual, the MPEP and the TMEP — four of our fourteen sources. Hence
 * two fields.
 *
 * Vocabulary rationale, including everything deliberately EXCLUDED:
 * docs/secondary-legal-authority-vocabulary.md
 */

// ───────────────────────── authority_type ─────────────────────────
//
// Ordered by tier, and the order in this array is not load-bearing — read the
// tier from AUTHORITY_TIER. Each value has to earn its place by changing what a
// caller would DO with the document; a value that only adds a synonym is a value
// that will be filled in inconsistently by 14 packs.

const AUTHORITY_TYPES = [
  // ── Tier 1: controlling. A tribunal in the document's own jurisdiction must
  //    follow it. These are the things an answer should lead with.
  'constitution',        // Constitutional text itself. Separated from `statute`
                         // because nothing supersedes it by ordinary enactment,
                         // so it never carries binding_status 'superseded'.
  'treaty',              // Ratified agreement with domestic force. Not in the
                         // current 14 sources, but included because its absence
                         // would force treaties into `statute`, which is wrong
                         // about how they are amended and displaced.
  'statute',             // Enacted legislation. U.S.C., Public Laws.
  'regulation',          // Legislative rule with the force of law — notice and
                         // comment, codified in the CFR. Distinct from
                         // `agency_guidance` precisely because that one is the
                         // sub-regulatory material that does NOT bind.
  'case',                // Judicial decision. Binding within its own court
                         // hierarchy, persuasive outside it — which is why the
                         // forum-relativity note below matters most here.
  'court_rule',          // FRCP, FRE, local rules. Force of law, but procedural
                         // and promulgated by courts rather than legislatures,
                         // so a caller filtering for "substantive law" needs to
                         // be able to exclude them.

  // ── Tier 2: official interpretation. The issuing body's own reading of an
  //    instrument it administers. Entitled to weight; binds no court.
  'agency_guidance',     // Sub-regulatory: interpretive rules, policy
                         // statements, staff bulletins, no-action letters,
                         // enforcement guidance. EEOC/DOL/NLRB guidance, SEC
                         // staff interpretations, FTC Legal Library.
  'agency_manual',       // The agency's internal operating manual: IRS IRM, DOJ
                         // Justice Manual, USPTO MPEP/TMEP, Copyright Office
                         // Compendium. Split from `agency_guidance` because
                         // these are the documents that carry binding_status
                         // 'binding_on_issuer' — they direct the agency's own
                         // staff while expressly conferring no rights on the
                         // public.
  'legislative_history', // Committee reports, conference reports, floor
                         // statements. Official in origin, interpretive in use.

  // ── Tier 3: practitioner guidance. Authoritative in practice, no legal force.
  'practice_manual',     // Court and tribunal practice manuals: EOIR practice
                         // manuals, FJC benchbooks.
  'jury_instruction',    // Pattern jury instructions. The direct answer to
                         // "what must be proven", which is why they get their
                         // own value rather than sitting inside
                         // `practice_manual` where a caller could not filter
                         // for them.
  'legal_treatise',      // Systematic expert treatment: the GAO Red Book.
                         // Current, maintained, cited by practitioners.
  'legislative_analysis',// CRS reports, GAO reports, Commons Library briefings.
                         // Non-partisan expert analysis prepared for
                         // legislators. NOT tier 2: CRS speaks for nobody and
                         // interprets no rule of its own. NOT tier 4: not
                         // peer-reviewed scholarship either.

  // ── Tier 4: scholarly commentary.
  'scholarly_article',   // Peer-reviewed or law-review published. OpenAlex,
                         // Crossref, DOAJ, Digital Commons.
  'working_paper',       // Preprint or unreviewed. Split from
                         // `scholarly_article` because "has this been through
                         // review" changes how much weight an agent should give
                         // it, and both arrive from the same upstreams.

  // ── Tier 5: historical commentary.
  'historical_treatise', // A treatise whose value is historical rather than
                         // current — the public-domain 1910 titles. Labelled so
                         // an agent never presents one as the current rule.

  // ── Tier 6: reference. Makes no authority claim at all.
  'reference',           // Glossaries, citation guides, dictionaries. Kept
                         // rather than folded into `scholarly_article`, which
                         // would put a definition list in the scholarship tier
                         // and corrupt every ranking that reads it.
] as const;

type AuthorityType = (typeof AUTHORITY_TYPES)[number];

/** The five tiers the product promise names, plus reference for things making no claim. */
const AUTHORITY_TIERS = [
  'controlling',
  'official_interpretation',
  'practitioner_guidance',
  'scholarly_commentary',
  'historical_commentary',
  'reference',
] as const;

type AuthorityTier = (typeof AUTHORITY_TIERS)[number];

const TIER_OF: Record<AuthorityType, AuthorityTier> = {
  constitution: 'controlling',
  treaty: 'controlling',
  statute: 'controlling',
  regulation: 'controlling',
  case: 'controlling',
  court_rule: 'controlling',
  agency_guidance: 'official_interpretation',
  agency_manual: 'official_interpretation',
  legislative_history: 'official_interpretation',
  practice_manual: 'practitioner_guidance',
  jury_instruction: 'practitioner_guidance',
  legal_treatise: 'practitioner_guidance',
  legislative_analysis: 'practitioner_guidance',
  scholarly_article: 'scholarly_commentary',
  working_paper: 'scholarly_commentary',
  historical_treatise: 'historical_commentary',
  reference: 'reference',
};

/** 1 = controlling … 6 = reference. Lower sorts first. */
function authorityTier(t: AuthorityType): AuthorityTier {
  return TIER_OF[t];
}

function authorityTierRank(t: AuthorityType): number {
  return AUTHORITY_TIERS.indexOf(TIER_OF[t]) + 1;
}

/**
 * The one-bit view a lot of callers actually want. Derived rather than stored,
 * so it cannot drift away from authority_type — which is what would happen if
 * `primary`/`secondary` were a column somebody had to remember to set.
 */
function isPrimaryAuthority(t: AuthorityType): boolean {
  return TIER_OF[t] === 'controlling';
}

// ───────────────────────── binding_status ─────────────────────────

const BINDING_STATUSES = [
  'binding',            // A tribunal in this document's own jurisdiction must
                        // follow it. See the forum-relativity note below: this
                        // is the document's claim, not a claim about the
                        // caller's forum.
  'persuasive',         // May be relied on, need not be followed. The default
                        // truthful answer for most secondary material.
  'binding_on_issuer',  // Binds the issuing agency's own staff; creates no
                        // rights in third parties and binds no court. The IRM,
                        // the Justice Manual and the MPEP all say this about
                        // themselves in terms. Collapsing it into 'binding'
                        // would be flatly false; collapsing it into
                        // 'persuasive' loses that an examiner IS required to
                        // follow it, which is the whole reason a patent
                        // practitioner reads the MPEP.
  'proposed',           // Not yet in force: an NPRM's rule text, an introduced
                        // bill, a draft edition. effective_date is in the
                        // future or unknown.
  'superseded',         // Replaced by a later instrument. `superseded_by` names
                        // it. Still served — per Bruce's serve-and-label ruling
                        // we never withhold — but never as current law. The GAO
                        // Red Book third edition against the fourth is exactly
                        // this.
  'repealed',           // Withdrawn with nothing replacing it. Distinct from
                        // 'superseded' because the caller's next action differs:
                        // superseded means go read superseded_by, repealed means
                        // there is nothing to go and read.
  'vacated',            // Struck down by a court. Distinct from 'repealed'
                        // because it was never validly law rather than having
                        // been withdrawn, and because a vacated rule served as
                        // binding is the worst single error this schema can
                        // make.
  'unknown',            // We could not determine it from the source. THE
                        // DEFAULT, deliberately: the alternative to an explicit
                        // 'unknown' is a pack guessing, and a guessed 'binding'
                        // is the most dangerous value in this vocabulary. An
                        // omission has to read as an omission, not as
                        // 'persuasive'.
] as const;

type BindingStatus = (typeof BINDING_STATUSES)[number];

/**
 * BINDING_STATUS IS A CODED VALUE **AND** A PROSE NOTE. Both, not either.
 *
 * Settled here because two shipped tools had already guessed differently. The
 * govinfo GAO tools (#1972) put a whole sentence in `binding_status` — "GAO's own
 * view of federal appropriations law. Persuasive and followed in practice by
 * agency counsel; not binding on courts." That sentence is genuinely more useful
 * to a caller than any enum value, and it is also unrankable, unfilterable and
 * unjoinable. Choosing one loses something real either way:
 *
 *   enum only   — an agent can rank and filter, but "followed in practice by
 *                 agency counsel though not binding on courts" is exactly the
 *                 kind of thing a lawyer needs and `persuasive` does not say.
 *   prose only  — reads well and cannot be computed over. Ranking 14 sources by
 *                 authority is the product promise; it dies here.
 *
 * So `binding_status` is the controlled vocabulary (machine-readable, what
 * authoritySortKey reads) and `binding_note` is the sentence (human-readable,
 * never parsed). A pack SHOULD set both. The enum is what ranks; the note is
 * what explains. Nothing ever infers one from the other — a note is not parsed
 * into a status, because a regex over legal prose producing `binding` is the
 * single worst failure available to this schema.
 */
const BINDING_STATUS_IS_CODED_PLUS_PROSE = true;

/**
 * BINDING IS RELATIVE TO A FORUM AND WE DO NOT KNOW THE CALLER'S FORUM.
 *
 * A Second Circuit opinion is binding in the Second Circuit and persuasive in
 * the Ninth. So `binding_status: 'binding'` means "this instrument carries the
 * force of law within the jurisdiction named in its own `jurisdiction` field",
 * and nothing more. The caller composes (jurisdiction, binding_status) against
 * its own forum. Baking the forum in — a `binding_in_2d_cir` value — would make
 * the field a lie for every other caller, so it is excluded by design.
 */
const BINDING_IS_FORUM_RELATIVE = true;

/**
 * How much a binding_status should discount a document WITHIN its tier. A
 * superseded statute must not outrank a current agency manual when the question
 * is "what is the rule now", and tier alone would rank it above.
 *
 * Multiplied into the sort key rather than bolted on as a special case so the
 * behaviour is one number a reader can check.
 */
const TIER_STEP = 10;

const STATUS_PENALTY: Record<BindingStatus, number> = {
  // In force. No penalty — these three are equally "live", and which of them is
  // the right answer is decided by the TIER, not here.
  binding: 0,
  binding_on_issuer: 0,
  persuasive: 0,
  // Unlabelled costs a little, but we do not bury a document for being honest
  // about what we could not determine. Stays well inside one tier.
  unknown: 2,
  // ── Past TIER_STEP, so these CROSS A TIER BOUNDARY. That is the point and it
  //    is worth being explicit about, because it is the one place where
  //    binding_status outranks authority_type:
  //
  //    superseded statute      = 10 + 12 = 22
  //    current agency manual   = 20 +  0 = 20   ← wins
  //
  //    The default question a caller is asking is "what is the rule NOW", and a
  //    superseded statute is not an answer to it while a current manual is. A
  //    caller asking what the law was in 2019 filters on effective_date and
  //    binding_status explicitly rather than relying on this ordering.
  //
  //    The penalties are sized to cross exactly ONE tier, never two: the largest
  //    is 16, so nothing falls more than one-and-a-bit tiers. A repealed statute
  //    (25) still outranks a practitioner treatise (30), which is deliberate —
  //    the treatise is not law either, and the statute is at least primary text.
  proposed: 11,    // Not yet in force. Lands just below current guidance (20 vs 21).
  superseded: 12,  // A current version exists; prefer it. Read superseded_by.
  repealed: 15,    // Withdrawn, nothing replaces it.
  vacated: 16,     // Struck down. The value most dangerous to serve as current.
};

/**
 * Sort key for "which of these is the better authority". Ascending: lower is
 * stronger. Combines both axes, because either one alone gives a wrong order.
 */
function authoritySortKey(a: Pick<LegalAuthority, 'authority_type' | 'binding_status'>): number {
  return authorityTierRank(a.authority_type) * TIER_STEP + STATUS_PENALTY[a.binding_status ?? 'unknown'];
}

/** Strongest authority first. Stable for equal keys. */
function rankByAuthority<T extends Pick<LegalAuthority, 'authority_type' | 'binding_status'>>(docs: T[]): T[] {
  return docs
    .map((d, i) => ({ d, i, k: authoritySortKey(d) }))
    .sort((x, y) => x.k - y.k || x.i - y.i)
    .map((x) => x.d);
}

function isAuthorityType(v: unknown): v is AuthorityType {
  return typeof v === 'string' && (AUTHORITY_TYPES as readonly string[]).includes(v);
}

function isBindingStatus(v: unknown): v is BindingStatus {
  return typeof v === 'string' && (BINDING_STATUSES as readonly string[]).includes(v);
}

/**
 * A TIER NAME IS NOT AN AUTHORITY TYPE, and something has to say so out loud.
 *
 * The shipped govinfo GAO tools (#1972) emit `authority_type:
 * 'official_interpretation'` — which is a TIER, spanning three types. It is a
 * reasonable-looking mistake and `isAuthorityType` already returns false for it,
 * but a pack that proxies live never touches the CHECK constraint that would
 * reject it, so nothing tells the author. Fourteen packs making this call
 * independently is exactly the "vague enum poisons everything downstream" risk
 * this vocabulary exists to close.
 *
 * Accepting a tier as a type is NOT the fix. `official_interpretation` covers
 * `agency_guidance`, `agency_manual` and `legislative_history`, and collapsing
 * them destroys the only distinction that justifies `binding_on_issuer` — the
 * reason the two-field design exists at all. So the coarse value is refused and
 * the author is told which types to choose between.
 *
 * Returns the valid type, or a diagnosis naming the candidates.
 */
function classifyAuthorityInput(v: unknown):
  | { ok: true; authority_type: AuthorityType }
  | { ok: false; reason: string; candidates: AuthorityType[] } {
  if (isAuthorityType(v)) return { ok: true, authority_type: v };

  if (typeof v === 'string' && (AUTHORITY_TIERS as readonly string[]).includes(v)) {
    const candidates = AUTHORITY_TYPES.filter((t) => TIER_OF[t] === v);
    return {
      ok: false,
      candidates,
      reason: `"${v}" is a TIER, not an authority_type. A tier is derived from the ` +
        `type via authorityTier(); passing it as the type loses the distinction the ` +
        `tier is made of. Pick one of: ${candidates.join(', ')}.`,
    };
  }

  return {
    ok: false,
    candidates: [],
    reason: `"${String(v)}" is not an authority_type. Valid values: ${AUTHORITY_TYPES.join(', ')}.`,
  };
}

// ───────────────────────── licence terms ─────────────────────────
//
// Added for decision #1973 / task #1974: Bruce ruled we WILL mirror CC BY-NC-SA
// material (Cornell LII/Wex, CORE, CALI), served free through the gateway's
// existing `zeroRated` mechanism. That makes the licence side of this shape
// load-bearing in a way a single string cannot carry.
//
// WHY THIS IS PER DOCUMENT AND NOT PER SOURCE. CALI is the proof: most eLangdell
// titles are BY-NC-SA, but *Sources of American Law* is BY-SA with no NC clause.
// A per-pack licence constant mislabels it, and one mis-filed title is the whole
// compliance story. Same shape as the `finra` precedent, where one pack reads two
// distributions under two different sets of terms — which is why `zeroRated`
// accepts a string[] of tool names rather than only `true`.
//
// WHY A US FEDERAL WORK IS NOT "A LICENCE". 17 U.S.C. §105 makes the work
// UNCOPYRIGHTABLE. Nobody granted us anything and there is no licensor, no
// attribution clause and no downstream obligation. Forcing that into a
// CC-shaped field would tell a caller it is bound by terms that do not exist,
// which is its own kind of false statement — so `license_kind` separates the
// two and `obligations` comes back empty rather than defaulting to attribution.

const LICENSE_KINDS = [
  'public_domain_us_gov',   // 17 U.S.C. §105. Uncopyrightable, not licensed.
  'public_domain_expired',  // Copyright lapsed — the Gutenberg treatises.
  'public_domain_dedicated',// CC0 and equivalents: a deliberate dedication.
  'creative_commons',       // A CC grant with clauses that bite. BY/SA/NC/ND.
  'open_government',        // UK OGL, Open Parliament Licence, EU CC BY. Reuse
                            // including commercial reuse is granted, usually
                            // with attribution.
  'permission_none',        // No reuse grant published. Per the standing rule
                            // (`mirror-needs-grant-proxy-does-not`, Bruce
                            // 2026-09-08) we may PROXY this live but must not
                            // mirror it. The corpus table refuses this value —
                            // see the CHECK in migration 196.
  'unknown',                // Not yet checked. Also refused by the corpus table:
                            // "check before you bake, not after".
  'vendor_terms',           // A bespoke API/vendor licence with its own clauses —
                            // the Semantic Scholar API License Agreement, CORE's
                            // Terms & Conditions. Not CC, not open government,
                            // and not "no grant": there IS a grant, it is just
                            // theirs. Proxy-only: such terms forbid passing the
                            // data on as a dataset, so `mayMirror` is false and
                            // the corpus table's CHECK does not admit it. Added
                            // for #1974 so a proxied non-commercial API can carry
                            // real LicenseTerms instead of being mislabelled as
                            // Creative Commons or as unlicensed.
] as const;

type LicenseKind = (typeof LICENSE_KINDS)[number];

/** The clauses that actually constrain a caller. Empty for a public-domain work. */
const LICENSE_OBLIGATIONS = [
  'attribution',    // BY — the credit in `attribution` must be shown.
  'share_alike',    // SA — derivatives must carry the same licence.
  'non_commercial', // NC — the reason #1974 needs zeroRated.
  'no_derivatives', // ND — no modified redistribution.
] as const;

type LicenseObligation = (typeof LICENSE_OBLIGATIONS)[number];

interface LicenseTerms {
  /**
   * SPDX identifier where one exists: 'CC-BY-NC-SA-4.0', 'CC-BY-SA-4.0',
   * 'CC-BY-4.0', 'CC0-1.0', 'OGL-UK-3.0'. US federal works have no SPDX id
   * because they are not licensed at all, so they carry the LicenseRef form
   * 'LicenseRef-US-Gov-Works-17USC105' — distinguishable at a glance from a CC
   * grant, which is the point.
   */
  id: string;
  kind: LicenseKind;
  url: string | null;
  /**
   * The literal attribution string we are required to render, written out. A
   * boolean cannot be shown to a user, and ShareAlike compliance means SHOWING
   * the credit — so this is the text, or null when nothing is required.
   */
  attribution: string | null;
  /** The clauses that bite. Empty array for a public-domain work. */
  obligations: LicenseObligation[];
}

/** 'LicenseRef-' prefix marks an id that is not an SPDX licence — see LicenseTerms.id. */
const US_GOV_LICENSE_ID = 'LicenseRef-US-Gov-Works-17USC105';

/** The terms for a work of the US federal government. No licensor, no clauses. */
function usGovernmentWork(): LicenseTerms {
  return {
    id: US_GOV_LICENSE_ID,
    kind: 'public_domain_us_gov',
    url: 'https://www.law.cornell.edu/uscode/text/17/105',
    attribution: null,
    obligations: [],
  };
}

/**
 * Is the CALLER bound by anything downstream? This is the flag a caller needs in
 * order to comply, and it must be surfaced on the payload: they cannot honour
 * terms we never showed them.
 */
function isEncumbered(l: LicenseTerms): boolean {
  return l.obligations.length > 0;
}

/**
 * Does serving this document have to be free? NC forbids commercial use, and
 * Pipeworx bills per call, so an NC document must route through the gateway's
 * `zeroRated` path. This is the hook #1974 reads; it is derived from the
 * obligations rather than stored, so it cannot drift away from the licence.
 */
function requiresZeroRating(l: LicenseTerms): boolean {
  return l.obligations.includes('non_commercial');
}

/**
 * May we MIRROR this document, as opposed to proxying it live? Bruce's standing
 * rule: `mirror-needs-grant-proxy-does-not` (2026-09-08). Everything in the
 * corpus rail is a mirror by construction, so this has to be true for anything
 * that lands in `secondary_legal_documents` — and migration 196 enforces it in
 * the database rather than trusting 14 loaders to remember.
 */
function mayMirror(l: LicenseTerms): boolean {
  return l.kind !== 'permission_none' && l.kind !== 'unknown' && l.kind !== 'vendor_terms';
}

/** One sentence a caller can render verbatim next to the text. */
function licenseNote(l: LicenseTerms): string {
  if (!isEncumbered(l)) {
    return l.kind === 'public_domain_us_gov'
      ? 'Work of the United States Government — not subject to copyright (17 U.S.C. § 105). No reuse conditions.'
      : `${l.id} — no reuse conditions.`;
  }
  const clauses: string[] = [];
  if (l.obligations.includes('attribution')) {
    clauses.push(`you must credit the source${l.attribution ? ` as: "${l.attribution}"` : ''}`);
  }
  if (l.obligations.includes('share_alike')) clauses.push(`any derivative you publish must carry ${l.id}`);
  if (l.obligations.includes('non_commercial')) clauses.push('you may not use it commercially');
  if (l.obligations.includes('no_derivatives')) clauses.push('you may not publish modified versions');
  return `${l.id} — ${clauses.join('; ')}. These conditions bind you as well as us.`;
}

/**
 * A Creative Commons grant, with the obligations DERIVED from the SPDX id so
 * the two can never disagree: 'CC-BY-NC-SA-2.5' yields attribution +
 * non_commercial + share_alike, and the licence URL is built from the same
 * tokens. `attribution` is the credit line the rightsholder asks for, written
 * out — BY means rendering it, so it travels on the payload verbatim.
 *
 * Added for #1974 (Cornell LII/Wex is BY-NC-SA 2.5 per its own terms page;
 * CALI eLangdell titles are BY-NC-SA 4.0 or BY-SA 4.0 per each book's front
 * matter). A pack that hand-types `obligations` next to an id is one edit
 * away from a BY-SA title labelled non-commercial or the reverse, and one
 * mis-filed title is the whole compliance story.
 */
function creativeCommonsLicense(id: string, attribution: string | null): LicenseTerms {
  const m = /^CC-(0|BY(?:-NC)?(?:-SA|-ND)?)-(\d+\.\d+)$/i.exec(id.trim());
  if (!m) throw new Error(`creativeCommonsLicense: unrecognised id ${JSON.stringify(id)} (expected e.g. CC-BY-NC-SA-4.0 or CC0-1.0-style CC-0-1.0)`);
  const clauses = m[1].toUpperCase();
  const version = m[2];
  if (clauses === '0') {
    return {
      id: `CC0-${version}`,
      kind: 'public_domain_dedicated',
      url: `https://creativecommons.org/publicdomain/zero/${version}/`,
      attribution: null,
      obligations: [],
    };
  }
  const obligations: LicenseObligation[] = ['attribution'];
  if (clauses.includes('-NC')) obligations.push('non_commercial');
  if (clauses.includes('-SA')) obligations.push('share_alike');
  if (clauses.includes('-ND')) obligations.push('no_derivatives');
  return {
    id: `CC-${clauses}-${version}`,
    kind: 'creative_commons',
    url: `https://creativecommons.org/licenses/${clauses.toLowerCase()}/${version}/`,
    attribution,
    obligations,
  };
}

/**
 * Terms that are a vendor's own document rather than a public licence — an API
 * licence agreement we accepted to hold a key. `id` uses the SPDX LicenseRef
 * form so it cannot be mistaken for a CC grant; `url` is the document itself;
 * `obligations` are whichever of the four clauses the document actually
 * imposes, read from it rather than assumed. Always proxy-only (see mayMirror).
 */
function vendorTermsLicense(opts: {
  ref: string;
  url: string;
  attribution: string | null;
  obligations: LicenseObligation[];
}): LicenseTerms {
  const ref = opts.ref.startsWith('LicenseRef-') ? opts.ref : `LicenseRef-${opts.ref}`;
  return { id: ref, kind: 'vendor_terms', url: opts.url, attribution: opts.attribution, obligations: [...opts.obligations] };
}

/**
 * Put the licence ON THE PAYLOAD. Every response of a licensed pack — including
 * soft failures, which are still "derived from" the licensed source — carries
 * `license` (the LicenseTerms: id, kind, url, attribution, obligations),
 * `license_note` (one sentence a caller can render verbatim) and, for BY
 * terms, a top-level `attribution` so the credit is the first thing a
 * synthesising model reads. Leading keys on purpose — mcps/finra established
 * that ordering and the reason (fleet #531): the answer path passes a pack's
 * structuredContent through, so what leads the object leads the answer.
 *
 * This is the coordination point with #1970/#1976: one `license` field, one
 * shape, derived from LicenseTerms — never a second per-pack mechanism.
 */
function attachLicense<T>(result: T, terms: LicenseTerms): Record<string, unknown> {
  const head: Record<string, unknown> = {
    ...(terms.attribution ? { attribution: terms.attribution } : {}),
    license: terms,
    license_note: licenseNote(terms),
  };
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    return { ...head, ...(result as Record<string, unknown>) };
  }
  return { ...head, data: result };
}

function isLicenseKind(v: unknown): v is LicenseKind {
  return typeof v === 'string' && (LICENSE_KINDS as readonly string[]).includes(v);
}

function isLicenseObligation(v: unknown): v is LicenseObligation {
  return typeof v === 'string' && (LICENSE_OBLIGATIONS as readonly string[]).includes(v);
}

// ───────────────────────── the envelope ─────────────────────────

/**
 * The authority envelope every secondary-legal pack attaches to a document.
 * Mirrors the columns in supabase/migrations/196_secondary_legal_corpus.sql —
 * keep the two in step.
 */
interface LegalAuthority {
  /** Stable id within the source, e.g. 'R47132' or 'mpep-2106'. */
  doc_id: string;
  /** Pack/source slug this came from, e.g. 'crs-reports'. */
  source: string;
  title: string;

  authority_type: AuthorityType;
  /** Nullable so an honest omission is representable; treated as 'unknown'. */
  binding_status: BindingStatus | null;
  /**
   * The nuance the enum cannot carry, as a sentence a caller can show a human.
   * BOTH fields ship — see BINDING_STATUS_IS_CODED_PLUS_PROSE below.
   *
   * e.g. binding_status: 'persuasive' + binding_note: "GAO's own view of federal
   * appropriations law. Persuasive and followed in practice by agency counsel;
   * not binding on courts."
   */
  binding_note: string | null;

  /**
   * Whose law. Hierarchical so a caller can prefix-match:
   * 'us' · 'us-federal' · 'us-federal-ca9' · 'us-tx' · 'uk' · 'eu'.
   *
   * 'us-federal', NOT 'us-federal': the shipped govinfo GAO tools (#1972) already
   * emit the long form, and matching what is live costs nothing while an
   * abbreviation nobody needs would make two spellings of one jurisdiction.
   */
  jurisdiction: string;
  /** The body that issued it, in its own words: 'Congressional Research Service'. */
  issuer: string;

  /** When the instrument took or takes effect. Null when the source says nothing. */
  effective_date: string | null;
  /** Set when binding_status is superseded/repealed/vacated. A doc_id or citation. */
  superseded_by: string | null;

  /** Citations this document makes, as the source writes them. Never guessed. */
  citations: string[];

  /**
   * The terms WE rely on to serve this document, and the obligations they put on
   * the CALLER. Per document, not per source — see the LicenseTerms doc comment
   * for why that is not a nicety.
   */
  license: LicenseTerms;

  /** When we fetched our copy. Always set by the loader; never by hand. */
  retrieved_at: string;
  /** The source's own last-modified, when it publishes one. */
  source_last_modified: string | null;
}

// ───────────────────────── the age-labelling contract ─────────────────────────
//
// Bruce's ruling, 2026-09-14: SERVE STALE DATA AND LABEL THE AGE. Never refuse.
// So nothing in this section throws, returns null, or withholds a document. The
// only output is a label, and the caller decides.
//
// THE TWO AGES ARE DIFFERENT AND THE FLAG ONLY WATCHES ONE OF THEM.
//
//   age_days        — how old OUR COPY is (now - retrieved_at). This is the one
//                     `stale` keys on, because it is the one that answers "did
//                     our refresh stop running". It is a defect when it grows.
//   source_age_days — how old the DOCUMENT is (now - source_last_modified).
//                     Informational, and NEVER a staleness signal: the
//                     Constitution is 238 years old and perfectly fresh. Wiring
//                     the flag to this instead is the obvious bug here, which is
//                     why they have different names and this paragraph exists.

const DAY_MS = 86_400_000;

/**
 * Per-source tolerance in days: how old our copy may get before we say so.
 * Set from the source's own publication cadence plus one missed cycle, because
 * the failure worth catching is a refresh that STOPPED, not a source that is
 * between releases.
 *
 * A source absent from this map gets DEFAULT_TOLERANCE_DAYS and is reported as
 * using the default, rather than being skipped. An unlisted source that is
 * silently exempt is how a staleness check becomes unable to fail.
 */
const SOURCE_TOLERANCE_DAYS: Record<string, number> = {
  // Continuously revised, so a copy older than ~2 weeks means the cron stopped.
  'crs-reports': 14,
  'doj-justice-manual': 21,
  'irs-irm': 21,
  'govuk-manuals': 14,
  // Weekly to monthly publishers: one cycle plus a missed one.
  'gao-reports': 21,
  'ftc-legal-library': 60,
  'eeoc-dol-nlrb-guidance': 60,
  'sec-staff-interpretations': 60,
  'fjc-publications': 60,
  // Quarterly / edition-driven. Generous on the document, tight enough that a
  // dead refresh still surfaces within a cycle or two.
  'constitution-annotated': 120,
  'eoir-practice-manuals': 120,
  'uspto-mpep': 200,
  'uspto-tmep': 400,
  'copyright-compendium': 400,
  'federal-jury-instructions': 400,
  // Historical corpus: the documents never change, but a re-crawl that stops
  // still means the pipeline is dead, so this is a liveness number not a
  // freshness one.
  'gutenberg-legal': 400,
};

const DEFAULT_TOLERANCE_DAYS = 90;

function sourceToleranceDays(source: string): number {
  return SOURCE_TOLERANCE_DAYS[source] ?? DEFAULT_TOLERANCE_DAYS;
}

interface AgeLabel {
  retrieved_at: string;
  source_last_modified: string | null;
  effective_date: string | null;
  /** Age of OUR COPY in days. What `stale` watches. */
  age_days: number;
  /** Age of the DOCUMENT in days, or null. Informational — never a defect. */
  source_age_days: number | null;
  /**
   * false when the source's own last-modified is known NOT to track content.
   * GAOREPORTS is the case: 16,569 packages, none issued after 2009, every one
   * stamped last_modified 2025-03-07 — a bulk re-stamp. Present, well-formed,
   * recent, and meaningless.
   */
  source_last_modified_trusted: boolean;
  /**
   * The date the CONTENT is actually as-of, when the change signal cannot be
   * believed. Where this is set, source_age_days is measured from it rather than
   * from the re-stamp, because reporting a 2009 report as 191 days old is a
   * confident false statement and "we don't know" would have been better.
   */
  content_as_of: string | null;
  tolerance_days: number;
  /** true when age_days > tolerance_days. Never a reason to withhold. */
  stale: boolean;
  /** Set when tolerance came from DEFAULT_TOLERANCE_DAYS rather than the map. */
  tolerance_is_default: boolean;
  /** One sentence a caller can show a human verbatim. */
  note: string;
}

function ageDays(fromIso: string | null | undefined, nowMs: number): number | null {
  if (!fromIso) return null;
  const ms = Date.parse(fromIso);
  if (Number.isNaN(ms)) return null;
  // Clamp at 0: a retrieved_at a few seconds in the future (clock skew between
  // the loader and the reader) must not read as a negative age.
  return Math.max(0, Math.round(((nowMs - ms) / DAY_MS) * 10) / 10);
}

/**
 * Label a document's age. ALWAYS returns a label — there is no failure mode and
 * no refusal, by ruling.
 *
 * `toleranceOverrideDays` exists so a tool can expose a per-call tolerance and
 * so the contract is testable: lower it and `stale` must flip to true on the
 * same document, which is the red case for this check.
 */
function labelAge(
  doc: Pick<LegalAuthority, 'source' | 'retrieved_at' | 'source_last_modified' | 'effective_date'> & {
    /** Pass false when the source's last_modified is a bulk re-stamp. */
    source_last_modified_trusted?: boolean;
    /** Required when the above is false: what the content is really as-of. */
    content_as_of?: string | null;
  },
  nowMs: number = Date.now(),
  toleranceOverrideDays?: number,
): AgeLabel {
  const mapped = SOURCE_TOLERANCE_DAYS[doc.source];
  const tolerance = toleranceOverrideDays ?? mapped ?? DEFAULT_TOLERANCE_DAYS;
  const toleranceIsDefault = toleranceOverrideDays === undefined && mapped === undefined;

  // A missing or unparseable retrieved_at is not an excuse to skip the check.
  // It reads as infinitely old, which is loud, rather than as fresh, which is
  // the silent failure this whole contract exists to prevent.
  const copyAge = ageDays(doc.retrieved_at, nowMs);
  const age = copyAge ?? Number.POSITIVE_INFINITY;
  // A change signal we cannot believe must not produce a freshness number. Where
  // the source says "trust content_as_of instead", measure the document age from
  // that; where it says neither, report null rather than inventing one.
  const signalTrusted = doc.source_last_modified_trusted !== false;
  const asOf = doc.content_as_of ?? null;
  const srcAge = signalTrusted ? ageDays(doc.source_last_modified, nowMs) : ageDays(asOf, nowMs);
  const stale = age > tolerance;

  // WORDING IS LOAD-BEARING: no possessive. "our copy is 0d old" ships to
  // callers on every response on this rail and tells them we hold a copy, which
  // is against the standing rule to let callers assume pass-through. "retrieved
  // Nd ago" carries the identical meaning — a retrieval time is a fact about
  // the record either way — without making a claim about who stores what.
  // Caught live on crs_recent by Marten (0) before this rail reached its other
  // 13 sources; check:hosting-claims did not catch it because it does not scan
  // shared/ at all.
  const note = copyAge === null
    ? `no usable retrieved_at, so this is treated as stale against the ${tolerance}d tolerance for "${doc.source}"`
    : stale
      ? `retrieved ${age}d ago, past the ${tolerance}d refresh tolerance for "${doc.source}" — served anyway, labelled stale`
      : `retrieved ${age}d ago, within the ${tolerance}d refresh tolerance for "${doc.source}"`;

  return {
    retrieved_at: doc.retrieved_at,
    source_last_modified: doc.source_last_modified ?? null,
    effective_date: doc.effective_date ?? null,
    age_days: age === Number.POSITIVE_INFINITY ? Number.MAX_SAFE_INTEGER : age,
    source_age_days: srcAge,
    source_last_modified_trusted: signalTrusted,
    content_as_of: asOf,
    tolerance_days: tolerance,
    stale,
    tolerance_is_default: toleranceIsDefault,
    note,
  };
}

/**
 * The shape a pack returns for one document: the authority envelope, the age
 * label, and the text. Every secondary-legal tool response carries this so a
 * caller never has to ask a second question to find out how old the answer is.
 */
interface AuthoredDocument extends LegalAuthority {
  tier: AuthorityTier;
  freshness: AgeLabel;
  /**
   * The licence obligations, surfaced ON THE PAYLOAD rather than left in the row.
   * A caller cannot comply with terms we never showed it, so an encumbered
   * document always arrives with the conditions attached and the attribution
   * string spelled out.
   */
  license_terms: {
    encumbered: boolean;
    requires_zero_rating: boolean;
    note: string;
  };
  text?: string;
}

function withAuthorityEnvelope(
  doc: LegalAuthority,
  opts: { text?: string; nowMs?: number; toleranceOverrideDays?: number } = {},
): AuthoredDocument {
  return {
    ...doc,
    tier: authorityTier(doc.authority_type),
    freshness: labelAge(doc, opts.nowMs ?? Date.now(), opts.toleranceOverrideDays),
    license_terms: {
      encumbered: isEncumbered(doc.license),
      requires_zero_rating: requiresZeroRating(doc.license),
      note: licenseNote(doc.license),
    },
    ...(opts.text !== undefined ? { text: opts.text } : {}),
  };
}


/**
 * Was this failure OUR OWN web service? — the other half of `internal-db-class.ts`.
 *
 * fleet #1089 pulled failures from our own Postgres out of `upstream_down` by
 * keying on the SQLSTATE inside PostgREST's four-key error envelope. That
 * covered the majority and structurally could not cover the rest: the rest
 * never reach Postgres, so they carry no SQLSTATE. What was left, measured over
 * the 24h to 2026-09-02T15:00Z (fleet #1096):
 *
 *     5  pipeworx-catalog  get_pack_tools     Pipeworx catalog error: 522 — error code: 522
 *     3  fleet             fleet_list_open …  upstream_down: Fleet task queue did not respond within 25s
 *
 * 521/522/523/526 are Cloudflare saying its edge could not reach an ORIGIN, and
 * in both of those rows the origin is ours — `gateway.pipeworx.io` for the
 * catalog pack (it self-fetches when the gateway hasn't injected a manifest),
 * our own Supabase for fleet. There is no third party anywhere in either call.
 * Same defect as #1089: our own outage filed under `upstream_down`, the one
 * class that means "the source is unreachable and there is nothing for us to
 * fix", which is why the problem-tools triage skips it.
 *
 * WHY NOT A WORDING RULE. The obvious fix is to match `fleet db error:` and
 * `Pipeworx catalog error:` in classifyToolError. Each is emitted from exactly
 * one site today, so it would work today. It would also rot the first time
 * somebody rewords a label — silently, and in the direction of hiding our own
 * outage, which is worse than the bug being fixed. Every prose rule in
 * error-class.ts has needed widening as packs invented new wording (#409/#450/
 * #584); that history is most of that file's comment budget.
 *
 * WHAT THIS KEYS ON INSTEAD: **the host the call actually reached.** A URL's
 * hostname is a fact about the call, not a guess about its prose. Two
 * consequences that a pack-level flag could not give us, and the reason the
 * flag was rejected:
 *
 *   - It describes the CALL, not the pack. `govcon-intel` fans out to our own
 *     Supabase AND to genuine third parties; `court-listener` holds our cache
 *     in Supabase and fetches courtlistener.com. An `internallyHosted: true` on
 *     either pack would relabel a real third-party outage as ours — inventing
 *     work, which is the same class of error in the opposite direction.
 *   - It covers every future internal pack for free, instead of one declared
 *     slug at a time.
 *
 * WHY IT SURVIVES A REWORD. The marker below is not matched as a literal by two
 * separate files. `markInternalOrigin()` writes it and `internalHostMetricsClass()`
 * reads it, both from the single exported `INTERNAL_ORIGIN_MARKER` constant in
 * this module — so changing the wording changes both sides in the same edit and
 * cannot desynchronise them. The pack's own label (`fleet db error:`,
 * `Pipeworx catalog error:`) is not read at all: reword it freely, the class is
 * unaffected. That is the property `stripClassPrefix` lacked when it drifted
 * from its own classifier three times and needed a CI gate to hold them
 * together.
 *
 * WHERE THE 5xx TEST LIVES. `markInternalOrigin` is called from the places that
 * hold the real `Response` — `httpError`/`httpErrorMessage` and the timeout
 * branch of `fetchWithTimeout` in `shared/src/http.ts` — so "is this an
 * availability failure" is decided from the actual status code, never re-derived
 * by scraping a number out of a sentence. A 404 from our own registry for a slug
 * that does not exist is a caller's bad argument and is deliberately NOT marked.
 */

/**
 * OUR OWN web service was unreachable — not an upstream, and never `upstream_down`.
 *
 * ONE value, not three, unlike `internal_db_*`. That split existed because a
 * slow query, an exhausted pool and an unknown SQLSTATE have different owners
 * and different fixes. Here there is only one story to tell — an origin we run
 * did not answer the edge — and one owner. A bucket with no distinct owner per
 * value is decoration; #724 is what happens when a class holds several
 * situations, and inventing sub-values ahead of a reason to act on them
 * differently is the same mistake with the sign flipped.
 *
 * METRICS ONLY, exactly like PLATFORM_KEY_ERROR_CLASS and the internal_db
 * values. `classifyToolError` still answers `upstream_down` for the retry and
 * hint paths, which only care whether retrying or a sibling tool might work —
 * and it might. Nothing a caller sees or is charged changes here.
 *
 * READ SIDE: this value is in BROKEN_TOOL_CLASSES, FAULT_CLASSES and
 * ALL_ERROR_CLASSES in `workers/registry-api/src/index.ts`. All three, or it
 * lands on no dashboard — fleet #721 is the warning, where the #719 split
 * worked on the write side and was invisible for weeks.
 */
const INTERNAL_SERVICE_UNREACHABLE_CLASS = 'internal_service_unreachable';

/**
 * The token that carries "this origin is ours" from the call site to the
 * classifier.
 *
 * Appended to the error message rather than attached to the Error object,
 * because the object does not survive the trip: 275 packs return `{ error:
 * string }` instead of throwing, the gateway reads `observedError` as a string,
 * and the fleet pack rebuilds its error from a captured status + body across a
 * retry loop. A property on an Error would be dropped by every one of those
 * paths and the class would work in tests and vanish in production.
 *
 * WORDING IS LOAD-BEARING, same rule as labelAge's note in authority.ts. This
 * string is appended to a pack's thrown Error message (shared/src/http.ts),
 * and a thrown Error's message is exactly what the gateway hands back to the
 * caller as `content[0].text` when nothing rewrites it (workers/gateway/src
 * catches the throw and sets `rawResult.message = stripClassPrefix(error)`,
 * which does not touch this suffix) — so the original wording,
 * " [pipeworx-hosted origin — our own service, not a third party]", was not a
 * theoretical leak: it shipped live on pipeworx-catalog's 522s, 7 times in 6
 * hours on 2026-09-02 (see tests/golden-internal-service.test.ts), verbatim
 * naming Pipeworx as the host. check:hosting-claims never caught it because it
 * did not scan shared/ at all (task #2009). Reworded to describe the
 * OBSERVATION (the origin did not answer) without a claim about who runs it —
 * the identical fix labelAge got: drop the possessive, keep the fact.
 */
const INTERNAL_ORIGIN_MARKER = ' [origin did not respond — retry before concluding the named source is down]';

/**
 * Supabase's data plane for a project is `<ref>.supabase.co`, where the ref is
 * exactly twenty lowercase letters (ours is `pqauisounztsgdgfkhke`).
 *
 * Matching the shape rather than listing the ref keeps this correct when we add
 * a project — `supabaseEnv` on a pack entry already points some packs at a
 * second one — while still excluding `status.supabase.co`, which is Supabase's
 * own status page and emphatically not our database. Verified 2026-09-02 by
 * `grep -rhoE '[a-z0-9-]+\.supabase\.(co|in)' mcps shared workers scripts`: the
 * only real project ref anywhere in the tree is ours, the rest are doc
 * placeholders (`abc`, `xyz`, `example`) which this pattern also excludes. Same
 * finding internal-db-class.ts relies on for the PostgREST envelope being ours
 * by construction.
 */
const SUPABASE_PROJECT_HOST = /^[a-z]{20}\.supabase\.(co|in)$/;

/**
 * Is this a host WE run?
 *
 * Deliberately NOT including `*.workers.dev`: plenty of third-party APIs are
 * hosted on workers.dev, so the suffix says where something runs and not who
 * owns it. Every internal call we actually make goes to a `pipeworx.io`
 * hostname or to our Supabase project, both of which are ownership facts.
 *
 * `workers/gateway/src/provenance.ts`'s `OUR_HOSTS` answers the same
 * question and DOES include `workers.dev` — a documented divergence
 * (task #2051), not a bug to converge. That list decides what a response may
 * cite as a data SOURCE, where a false negative (citing our own worker as an
 * external source) is the hosting-disclosure leak this whole file exists to
 * prevent, so it errs broad. This one decides who gets BLAMED for a 5xx in
 * outage metrics read by on-call, where a false positive (crediting our own
 * infra with a third party's outage) hides the real failure, so it errs
 * narrow. Same suffix, opposite direction, because they are never called for
 * the same reason.
 *
 * Returns false on anything unparseable rather than throwing — this runs inside
 * an error path, and an error path that can itself throw turns a diagnosable
 * failure into a mystery.
 */
function isPipeworxOrigin(url: string | URL | undefined | null): boolean {
  if (!url) return false;
  let host: string;
  try {
    host = new URL(url instanceof URL ? url.href : url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (host === 'pipeworx.io' || host.endsWith('.pipeworx.io')) return true;
  return SUPABASE_PROJECT_HOST.test(host);
}

/**
 * Append the marker when this failure was OUR origin failing to answer.
 *
 * `status` is the HTTP status when there is one, and omitted for a timeout —
 * where there is no response at all, and "the origin did not answer" is the
 * whole observation. Statuses below 500 are left alone: a 404 from our own
 * registry for a slug that does not exist is the caller's argument, not our
 * outage, and marking it would put ordinary 404s on the incident dashboard.
 *
 * Idempotent, so a message that is wrapped and re-marked on the way up (the
 * fleet pack's retry loop re-throws through two layers) carries the marker once.
 */
function markInternalOrigin(
  message: string,
  url: string | URL | undefined | null,
  status?: number,
): string {
  if (status !== undefined && status < 500) return message;
  if (!isPipeworxOrigin(url)) return message;
  if (message.includes(INTERNAL_ORIGIN_MARKER)) return message;
  return message + INTERNAL_ORIGIN_MARKER;
}

/**
 * Which blob4 value a failure from our own web services books as, or undefined
 * if this is not one.
 *
 * Ordered AFTER `internalDbMetricsClass` at the call site: a PostgREST envelope
 * from our own Supabase is a strictly more specific statement about the same
 * row (which of our services, and why), and the two cannot disagree about
 * whether the failure is ours.
 */
function internalHostMetricsClass(error: string): string | undefined {
  return error.includes(INTERNAL_ORIGIN_MARKER) ? INTERNAL_SERVICE_UNREACHABLE_CLASS : undefined;
}


/**
 * One place to turn a failed `fetch` into an error a caller can act on.
 *
 * Nearly every pack was written the same way:
 *
 *     if (!res.ok) throw new Error(`Unsplash: ${res.status}`);
 *
 * which discards the response body — and the body is usually where the upstream
 * says what was actually wrong ("**symbol** not found: GBP", "parameter `year`
 * out of range", "unknown taxonomy id"). The caller gets a number, cannot
 * self-correct, and retries the same broken call. A 2026-07-31 sweep found this
 * shape in 481 of 1,400 packs, 47 of them PLATFORM-keyed.
 *
 * It also hides bugs one level down. Two of the first three packs audited had a
 * second defect that only existed because of this line: unsplash's rate-limit
 * branch sat BELOW a catch-all and was unreachable, and bea-gov parsed
 * `BEAAPI.Error.APIErrorDescription` below a `!res.ok` throw that made the
 * parsing dead code for every non-200.
 *
 * DELIBERATELY NOT A CLASSIFIER. It does not add `user_error:` /
 * `upstream_down:` prefixes. Those decide which tier a failure lands in, and the
 * `error` tier is what the daily problem-tools list is built from — it means
 * "Pipeworx has a defect". A 400 is genuinely ambiguous: often a caller's bad
 * argument, but sometimes a query WE built wrong (ted-eu comma-joined its CPV
 * values into something TED rejected, and that bug was found only because it sat
 * in `error`). Blanket-classifying 400s as caller mistakes would have hidden it.
 * A pack that KNOWS which it is should keep saying so explicitly; this helper is
 * for the 481 that say nothing at all.
 */

/** Longest upstream explanation we'll pass through. Enough for a real message,
 *  short enough that an HTML page or a stack trace can't swamp the error. */

const MAX_DETAIL = 300;

/**
 * Default bound for `fetchWithTimeout` when a pack doesn't state its own.
 *
 * 25s mirrors the number `epo-ops` landed on after measuring the real failure:
 * a degraded upstream that doesn't error, it just never answers, and a Worker
 * sits in `await fetch()` until ITS OWN execution budget kills the request —
 * which can take minutes, not seconds (epo_ops_search_patents measured 4-8
 * MINUTE hangs before this existed). 25s is short enough that a caller gets a
 * fast, actionable error instead of holding the connection, and long enough
 * that it doesn't false-trip on a merely-slow-but-alive upstream.
 */
const DEFAULT_FETCH_TIMEOUT_MS = 25_000;

/**
 * Read the body of a failed response and fold it into a throwable Error.
 *
 * Usage — note the `await`, which is the one thing that makes this a mechanical
 * change rather than a drop-in:
 *
 *     if (!res.ok) throw await httpError(res, 'Unsplash');
 *
 * Safe to call on any non-ok response: a body that is missing, empty, unreadable
 * or HTML degrades to exactly the old `Name: 404` string rather than throwing
 * something new from inside the error path.
 */
async function httpError(res: Response, name: string): Promise<Error> {
  return new Error(await httpErrorMessage(res, name));
}

/** The message text without constructing an Error — for packs that need to wrap
 *  it in their own envelope or add an explicit classification prefix. */
async function httpErrorMessage(res: Response, name: string): Promise<string> {
  // The one place a 5xx from a host WE run gets stamped as ours. `res.url` is
  // the URL the fetch actually resolved to (after redirects), so this is a fact
  // about the call rather than a guess from the `name` the pack passed in —
  // reword that label freely, the class does not move. See
  // internal-host-class.ts; no-op for every third-party upstream, which is why
  // this touches 481 packs' error text and changes none of it.
  return markInternalOrigin(
    `${name}: ${res.status}${detailSuffix(await readDetail(res))}${responseHints(res)}`,
    res.url,
    res.status,
  );
}

/**
 * Facts about a FAILED response that live in its headers, not its body, appended
 * so the gateway's classifier (which only ever sees this string) can tell a limit
 * from a wall from a refusal (fleet #3477). Both are standard, both are absent on
 * almost every response, and neither is invented: `Retry-After` is the server
 * saying "come back later" (the one thing that makes a 403 a throttle), and
 * Cloudflare marks a bot challenge with `cf-mitigated: challenge`.
 */
function responseHints(res: Response): string {
  const hints: string[] = [];
  const retryAfter = res.headers.get('retry-after');
  if (retryAfter) hints.push(`retry-after: ${retryAfter.slice(0, 40)}`);
  if ((res.headers.get('cf-mitigated') ?? '').toLowerCase() === 'challenge') hints.push('Cloudflare bot challenge (cf-mitigated: challenge)');
  return hints.length ? ` (${hints.join('; ')})` : '';
}

/**
 * Just the upstream's own explanation — no name, no status.
 *
 * For a pack that has already said both in its own sentence. epo-ops reads
 * `EPO rejected this search as too large (HTTP 413) — ${httpErrorMessage(…)}`,
 * which rendered as `… (HTTP 413) — EPO: 413.` once the XML detail was being
 * dropped: the upstream named twice, the status twice, and the one thing EPO
 * actually said ("Not enough characters before truncation character") nowhere
 * (fleet #712). Returns '' when the body carries nothing readable, so a caller
 * can fall back to its own wording.
 */
async function upstreamDetail(res: Response): Promise<string> {
  return readDetail(res);
}

/**
 * Read a SUCCESSFUL response as JSON, failing loudly when it isn't JSON.
 *
 * `httpError` above only ever runs on `!res.ok`, which leaves the nastier half
 * of the problem unhandled: an upstream that answers **HTTP 200 with an HTML
 * page**. A bot wall, a login redirect, a maintenance interstitial and a CDN
 * error page are all 200s, so `res.ok` is true, and `res.json()` then throws
 * `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`.
 *
 * That string is the problem. It names no upstream, carries no status, and
 * reads like a parser bug in Pipeworx — so it lands in the `error` tier, which
 * means "we have a defect", and the caller is told nothing they can act on.
 * data.govt.nz sat dead behind an Imperva challenge this way and every
 * status-code health check we own reported it green (7889a845). A zero-length
 * body has the same shape: `Unexpected end of JSON input`, seen this week on
 * uk-gazette (83% of external calls) and census.
 *
 * UNLIKE `httpError`, this one DOES classify, and the asymmetry is deliberate.
 * A 400 is genuinely ambiguous — often the caller's bad argument, sometimes a
 * query we built wrong — so blanket-classifying it would hide our own bugs.
 * There is no such ambiguity here: **no argument a caller can pass makes a JSON
 * API return an HTML page.** It is always the upstream, so `upstream_down:` is
 * a statement of fact rather than a guess, and it keeps these out of the
 * problem-tools list where they crowd out real defects.
 *
 *     const data = await parseJson<Feed>(res, 'UK Gazette');
 *
 * Call it only after the `!res.ok` check — on a failed response you want
 * `httpError`, which mines the body for the upstream's own explanation.
 */
async function parseJson<T>(res: Response, name: string): Promise<T> {
  let raw: string;
  try {
    raw = await res.text();
  } catch {
    throw new Error(
      `upstream_down: ${name} returned a body that could not be read (HTTP ${res.status}). ` +
        'The connection most likely dropped mid-response; retrying is reasonable.',
    );
  }

  const type = res.headers.get('content-type') ?? 'no content-type';

  if (!raw.trim()) {
    throw new Error(
      `upstream_down: ${name} answered HTTP ${res.status} with an EMPTY body where JSON was expected (${type}). ` +
        'Nothing about the request can cause this — it is an upstream fault, and the same call may well work on retry.',
    );
  }

  // Checked before parsing rather than in the catch, because knowing it is
  // markup is what turns "we failed to parse something" into "they served a
  // web page" — the second is diagnosable, the first is not.
  const head = raw.slice(0, 200).trimStart().toLowerCase();
  if (head.startsWith('<!doctype') || head.startsWith('<html') || head.startsWith('<?xml')) {
    const kind = head.startsWith('<?xml') ? 'an XML document' : 'an HTML page';
    // The summary, not the source. Pasting the first 120 characters of a web
    // page handed the agent `<!DOCTYPE html><html lang="en"…` — the same leak
    // this branch exists to describe (fleet #712).
    throw new Error(
      `upstream_down: ${name} answered HTTP ${res.status} with ${kind} instead of JSON (${type}). ` +
        'That is typically a bot wall, a login redirect or a maintenance page — it is returned as a SUCCESS, ' +
        `so status-code health checks read it as fine. No argument change will get past it. ` +
        `The page says: ${summarizeErrorBody(raw) || 'nothing readable'}`,
    );
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(
      `upstream_down: ${name} answered HTTP ${res.status} with a body that is not valid JSON (${type}). ` +
        `It begins: ${stripMarkup(raw).slice(0, 120) || '(unreadable)'}`,
    );
  }
}

/**
 * `fetch`, but bounded — the fix for a systemic gap found 2026-08-30: a grep
 * audit of every pack's `mcps/*\/src/index.ts` found 1,339 of ~1,500 call
 * `fetch()` with NO timeout guard anywhere in the file. Two of those
 * (epo-ops, statcan) were confirmed live-hanging for 4-8 minutes before this
 * existed — every unguarded call carries the same risk, just unconfirmed.
 *
 * Mirrors the `epoFetch` wrapper `mcps/epo-ops/src/index.ts` shipped first:
 * bound the request with `AbortSignal.timeout`, and on a timeout/abort throw
 * an `upstream_down:` error that names the upstream and the bound rather than
 * letting the raw `TimeoutError`/`AbortError` (which names neither) propagate.
 * `upstream_down:` is deliberate, same reasoning as `parseJson` above — no
 * argument a caller passes can make an upstream hang, so it is always the
 * upstream's fault, and marking it that way keeps a slow API off the
 * problem-tools list where it would crowd out our own defects.
 *
 * Usage — a mechanical swap for a bare `fetch(url, init)`:
 *
 *     const res = await fetchWithTimeout(url, init, 'Some API');
 *
 * Pass `timeoutMs` as a fourth argument to override the default for a pack
 * with a known-slower upstream; the label should be the same short name you'd
 * pass to `httpError`/`httpErrorMessage` for that call.
 */
async function fetchWithTimeout(
  url: string | URL,
  init: RequestInit = {},
  name: string,
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      // States the OBSERVATION (no response in N seconds), not a diagnosis.
      // "appears to be degraded" is an inference about the vendor that we have
      // not checked, and it is wrong in a way that misdirects whoever reads it:
      // a timeout from a Worker can equally mean OUR egress is blocked.
      //
      // Measured today (2026-09-01, fleet #1047): every call to
      // mainnet.base.org failed from the x402 facilitator while the identical
      // request from a laptop returned 200. Base was entirely healthy; the
      // public RPC refuses Cloudflare Worker egress. Had this message fired
      // there it would have blamed Base by name, and the next person would have
      // waited for a vendor outage to clear that did not exist.
      // A timeout has no status to test — there is no response at all — so
      // `markInternalOrigin` is called without one: an origin we run that never
      // answered is an availability failure by definition. This is the half of
      // fleet #1096 with neither a SQLSTATE nor a status code to key on.
      throw new Error(
        markInternalOrigin(
          `upstream_down: ${name} did not respond within ${timeoutMs / 1000}s. ` +
            `That can be ${name} being slow or down, or this environment being unable to reach it ` +
            `(some hosts refuse datacenter/Worker egress) — retry shortly, and check reachability ` +
            `from elsewhere before concluding ${name} is down.`,
          url,
        ),
      );
    }
    // Fleet #2382. Everything that isn't a timeout/abort here is a genuine
    // NETWORK-LEVEL failure — DNS resolution, connection refused, TLS handshake,
    // Cloudflare's own "Network connection lost." — meaning `fetch()` itself
    // threw and no HTTP response of any kind was ever received. Until this fix
    // that raw exception was rethrown VERBATIM: a bare `TypeError: fetch failed`
    // (or the Workers-runtime equivalent) names no upstream, carries no class
    // token, and reads exactly like a defect in OUR code — because it says
    // nothing about the call at all. It landed in `error`, the tier that means
    // "Pipeworx has a defect", for every one of the (at the time of writing)
    // ~470 packs that call this helper directly with no wrapper of their own.
    //
    // `dexscreener` hit this independently (fleet #1579) and fixed it with a
    // bespoke per-pack try/catch around `fetchWithTimeout`. That fix is correct
    // but only covers one pack; every other caller of this shared helper still
    // leaked the raw exception. Moving the same fix HERE — the one place that
    // already carries the timeout case — covers every pack that uses
    // `fetchWithTimeout` without a wrapper, for free, and without widening
    // `classifyToolError`'s regex list: the fix is giving the message a proper
    // `upstream_down:` token at the point the two facts (no response was ever
    // received, and which host we were trying to reach) are actually in hand,
    // not teaching the classifier to guess from prose after the fact.
    //
    // Safe on the same grounds as the timeout branch above: no argument a
    // caller passes can make `fetch()` itself throw a connection-level error,
    // so this is always an availability failure, never a caller mistake. Same
    // `markInternalOrigin` treatment — an origin we run that never answered is
    // still ours, not a third party's outage.
    const raw = err instanceof Error ? err.message : String(err);
    throw new Error(
      markInternalOrigin(
        `upstream_down: could not reach ${name} at all (${raw.slice(0, 160)}). ` +
          `No request reached ${name}, so this says NOTHING about whether the arguments you passed ` +
          'are valid — do not re-check them on the strength of this error. Retry shortly.',
        url,
      ),
    );
  }
}

function detailSuffix(detail: string): string {
  return detail ? ` — ${detail}` : '';
}

async function readDetail(res: Response): Promise<string> {
  let raw: string;
  try {
    raw = await res.text();
  } catch {
    // Body already consumed, or the connection died mid-read. The status alone
    // is still worth throwing — never let the error path throw its own error.
    return '';
  }
  return summarizeErrorBody(raw);
}

/**
 * Turn ANY error body — JSON, HTML, XML or plain text — into one short phrase
 * that never contains markup.
 *
 * This used to just drop an HTML or XML body on the floor, on the reasoning
 * that markup crowds out the status. That was half right. Dropping it loses the
 * one sentence a caller could have acted on: an `Access Denied` title, an SDMX
 * `<message:Error>` text, an OPS fault string. A 2026-08-30 support sweep
 * measured 13 of 291 caller-facing error rows carrying a raw page or document
 * verbatim, across 11 packs, and in every one of them the useful content —
 * "Access Denied", "Invalid country code", "SCRAPE_TIMEOUT" — was in there,
 * buried in markup the agent had to parse out of a string (fleet #712).
 *
 * So: extract the meaning, discard the markup. The output is passed through
 * `stripMarkup` unconditionally, which is what lets `check:error-body-leak`
 * assert mechanically that no caller-facing message can contain `<?xml`,
 * `<!DOCTYPE` or `<html`.
 */
function summarizeErrorBody(raw: string): string {
  if (!raw || !raw.trim()) return '';

  const head = raw.slice(0, 400).trimStart().toLowerCase();

  // An HTML error page (Cloudflare interstitial, nginx default, a login
  // redirect) says what it is in its <title>, and almost nowhere else.
  if (head.startsWith('<!doctype') || head.startsWith('<html')) {
    const title = htmlTitle(raw);
    return title
      ? `${title} (upstream returned an HTML error page, not an API response)`
      : 'upstream returned an HTML error page, not an API response';
  }

  // XML fault documents — EPO OPS, SDMX (`<message:Error>`), SOAP faults. The
  // human sentence sits in a child element whose tag name says what it is.
  if (head.startsWith('<?xml') || head.startsWith('<')) {
    const fault = xmlFaultText(raw);
    return fault
      ? `${stripMarkup(fault).slice(0, MAX_DETAIL)} (from the upstream's XML error document)`
      : 'upstream returned an XML error document with no readable message';
  }

  // Most JSON error bodies bury one human sentence among ids and echoed request
  // params. Prefer that sentence; fall back to the whole body when the shape is
  // unfamiliar, since an unfamiliar shape is exactly when we can least afford to
  // guess wrong and show nothing.
  const fromJson = messageFromJson(raw);
  return stripMarkup(fromJson ?? raw).slice(0, MAX_DETAIL);
}

/** The `<title>` of an HTML error page, or its first `<h1>` — the two places a
 *  bot wall, a 502 and an "Access Denied" all state what happened. */
function htmlTitle(raw: string): string | null {
  const head = raw.slice(0, 4000);
  for (const re of [/<title[^>]*>([\s\S]*?)<\/title>/i, /<h1[^>]*>([\s\S]*?)<\/h1>/i]) {
    const m = re.exec(head);
    const text = m ? stripMarkup(m[1]) : '';
    if (text) return text.slice(0, 160);
  }
  return null;
}

/** Tag names that carry the explanation in an XML fault document, namespace
 *  prefix optional (`<message:Error>`, `<com:Text>`, `<faultstring>`). */
const XML_FAULT_TAG_RE =
  /<(?:[A-Za-z0-9_.-]+:)?(?:text|message|description|faultstring|reason|detail|title|errormessage|error)\b[^>]*>([^<]{2,400})</i;

function xmlFaultText(raw: string): string | null {
  const head = raw.slice(0, 8000);
  const tagged = XML_FAULT_TAG_RE.exec(head);
  if (tagged && tagged[1].trim()) return tagged[1];

  // Nothing conventionally named — take the longest text node instead. A fault
  // document with one sentence in an oddly named element is still readable;
  // returning nothing at all is not.
  let best = '';
  for (const m of head.matchAll(/>([^<>]{8,400})</g)) {
    const text = m[1].trim();
    if (text.length > best.length) best = text;
  }
  return best || null;
}

/**
 * Remove every tag and stray angle bracket, then collapse$shared whitespace.
 *
 * Applied to everything on the way out, including the JSON and plain-text
 * paths, because an upstream is free to embed markup in a JSON string field —
 * and a leak is a leak regardless of which branch produced it.
 */
function stripMarkup(s: string): string {
  return collapse$shared(decodeEntities(s.replace(/<[^>]*>/g, ' ')).replace(/[<>]/g, ' '));
}

/** The handful of entities that show up in error-page titles. Decoded AFTER
 *  tags are stripped and BEFORE the angle-bracket sweep, so `&lt;script&gt;`
 *  in a title cannot decode into markup that survives — EMBL-EBI's ChEMBL 500
 *  page renders as `500 Internal Server Error &lt; EMBL-EBI` otherwise. */
function decodeEntities(s: string): string {
  return s
    .replace(/&(?:amp|#0*38);/gi, '&')
    .replace(/&(?:lt|#0*60);/gi, '<')
    .replace(/&(?:gt|#0*62);/gi, '>')
    .replace(/&(?:quot|#0*34);/gi, '"')
    .replace(/&(?:#0*39|apos|#x0*27);/gi, "'")
    .replace(/&nbsp;/gi, ' ');
}

/** The conventional "what went wrong" field, under any of the names upstreams
 *  actually use. Checked in order; first non-empty string wins. */
const MESSAGE_KEYS = [
  'message', 'error_message', 'errorMessage', 'detail', 'details',
  'description', 'error_description', 'reason', 'title', 'fault',
];

function messageFromJson(raw: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return pickMessage(parsed, 0);
}

function pickMessage(node: unknown, depth: number): string | null {
  // Two levels covers `{error: {message}}` and `{errors: [{detail}]}`, the two
  // shapes that account for nearly all of them, without walking a large payload.
  if (depth > 2 || node == null) return null;

  if (typeof node === 'string') return node.trim() || null;

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = pickMessage(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  if (typeof node !== 'object') return null;
  const obj = node as Record<string, unknown>;

  for (const key of MESSAGE_KEYS) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  // `{error: …}` where error is itself an object or a string — the single most
  // common wrapper, so it is worth descending into by name rather than scanning
  // every key and risking picking up an echoed request parameter.
  for (const key of ['error', 'errors', 'fault', 'Error', 'data']) {
    if (key in obj) {
      const found = pickMessage(obj[key], depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/** Errors are read in a single line of log output; newlines and runs of
 *  whitespace make a multi-line body unreadable there. */
function collapse$shared(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

// ── Bounded readers — peak memory, not just wall time (fleet #3322) ──────
//
// `parseJson` above does `await res.text()` then `JSON.parse(raw)`, so a
// multi-megabyte upstream body is held TWICE at peak: once as the raw string
// and once as the object graph (which for an array of small objects runs
// several times the byte size). Nothing in `workers/gateway` can see that
// peak — it happens inside the pack, before any gateway code holds a payload —
// which is why the gateway-side payload caps of #3293 and #3320 did not move
// the 503/1102 rate at all.
//
// Measured on the live gateway, 2026-10-19, sha fa5de5c34, direct tools/call:
//   statcan_list_cubes  8,049,566 B   <- one upstream array, no limit argument
//   gnomad_gene BRCA1   2,732,706 B
// Five of those in flight at the quality runner's width is ~40 MB of parse
// peak against a 128 MB isolate; Cloudflare kills the isolate and every
// request in flight returns 503/1102, which is why the victims look random.
//
// `readJsonArrayPrefix` is the fix for the dominant shape: an upstream that
// returns one enormous top-level JSON array with no server-side paging. It
// parses elements off the stream and DISCARDS the consumed bytes, so peak
// retained memory is one element plus one chunk rather than the whole body,
// and it cancels the body as soon as it has what it was asked for.

/** Default ceiling for a single upstream JSON body read into an isolate.
 *  Chosen so the known tail (statcan 8.0 MB, gnomad 2.7 MB) is bounded well
 *  below the point where a handful of concurrent reads exhausts 128 MB. */
const DEFAULT_MAX_JSON_BYTES = 1_500_000;

interface JsonArrayPrefix<T> {
  /** The decoded elements, at most `maxItems` of them. */
  items: T[];
  /** True when the upstream array had more elements than we read. */
  truncated: boolean;
  /** Bytes actually pulled off the socket — the number that bounds memory. */
  bytesRead: number;
  /** `Content-Length` if the upstream declared one, else null. */
  declaredBytes: number | null;
}

/**
 * Read the FIRST `maxItems` elements of a top-level JSON array off a response
 * stream without ever materialising the whole body.
 *
 * Use this instead of `parseJson` when the upstream returns one big array and
 * offers no `limit`/`offset` of its own. Peak retained memory is one element
 * plus the current chunk; the body is cancelled as soon as `maxItems` is
 * reached, so the remaining megabytes are never transferred at all.
 *
 *     const { items, truncated } = await readJsonArrayPrefix<Cube>(
 *       res, 'StatCan WDS', { maxItems: limit + offset });
 *
 * `maxBytes` is a second, independent backstop for a pathological element (a
 * single 50 MB object): hitting it stops the read and sets `truncated`, rather
 * than throwing, because a partial answer plus an explicit truncated flag is
 * more useful to a caller than an error.
 */
async function readJsonArrayPrefix<T>(
  res: Response,
  name: string,
  opts: { maxItems: number; maxBytes?: number },
): Promise<JsonArrayPrefix<T>> {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_JSON_BYTES;
  const declaredRaw = Number(res.headers.get('content-length'));
  const declaredBytes = Number.isFinite(declaredRaw) && declaredRaw > 0 ? declaredRaw : null;

  // No streaming body available (a mock, or an already-buffered response):
  // fall back to the whole-text path so behaviour stays correct, just unbounded.
  if (!res.body) {
    const all = await parseJson<T[]>(res, name);
    if (!Array.isArray(all)) throw new Error(`upstream_down: ${name} returned ${typeof all} where a JSON array was expected.`);
    return {
      items: all.slice(0, opts.maxItems),
      truncated: all.length > opts.maxItems,
      bytesRead: declaredBytes ?? 0,
      declaredBytes,
    };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const items: T[] = [];

  let buf = '';
  let scan = 0;
  let bytesRead = 0;
  let started = false; // consumed the opening '['
  let arrayEnded = false;
  let depth = 0;
  let inStr = false;
  let esc = false;
  let elemStart = -1;
  let truncated = false;

  const push = (text: string) => {
    const t = text.trim();
    if (!t) return;
    items.push(JSON.parse(t) as T);
  };

  try {
    outer: while (items.length < opts.maxItems && !arrayEnded) {
      const { value, done } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      buf += decoder.decode(value, { stream: true });
      if (bytesRead > maxBytes) { truncated = true; break; }

      for (; scan < buf.length; scan++) {
        const ch = buf[scan];

        if (inStr) {
          if (esc) { esc = false; continue; }
          if (ch === '\\') { esc = true; continue; }
          if (ch === '"') inStr = false;
          continue;
        }

        if (!started) {
          if (ch === '[') { started = true; continue; }
          if (ch.trim() === '') continue;
          throw new Error(
            `upstream_down: ${name} returned a body that does not begin with a JSON array (saw ${JSON.stringify(ch)}). ` +
              'This reader is only for upstreams that answer with one top-level array.',
          );
        }

        if (ch === '"') { if (depth === 0 && elemStart < 0) elemStart = scan; inStr = true; continue; }

        if (ch === '{' || ch === '[') {
          if (depth === 0 && elemStart < 0) elemStart = scan;
          depth++;
          continue;
        }

        if (ch === '}' || ch === ']') {
          if (depth > 0) {
            depth--;
            if (depth === 0 && elemStart >= 0) {
              push(buf.slice(elemStart, scan + 1));
              elemStart = -1;
              if (items.length >= opts.maxItems) { truncated = true; scan++; break outer; }
            }
            continue;
          }
          // depth 0 and a closing bracket: the end of the top-level array.
          if (elemStart >= 0) { push(buf.slice(elemStart, scan)); elemStart = -1; }
          arrayEnded = true;
          break outer;
        }

        if (ch === ',' && depth === 0) {
          if (elemStart >= 0) {
            push(buf.slice(elemStart, scan));
            elemStart = -1;
            if (items.length >= opts.maxItems) { truncated = true; scan++; break outer; }
          }
          continue;
        }

        // A bare scalar element (number / true / false / null).
        if (depth === 0 && elemStart < 0 && ch.trim() !== '') elemStart = scan;
      }

      // Drop everything already consumed. THIS is what bounds memory: without
      // it `buf` grows to the full body and the reader is streaming in name only.
      if (elemStart >= 0) {
        buf = buf.slice(elemStart);
        scan -= elemStart;
        elemStart = 0;
      } else {
        buf = buf.slice(scan);
        scan = 0;
      }
    }
  } finally {
    // Cancel rather than drain: the point is that the remaining megabytes are
    // never transferred. A cancel on an already-finished body is a no-op.
    await reader.cancel().catch(() => {});
  }

  return { items, truncated, bytesRead, declaredBytes };
}

/**
 * `parseJson`, with a hard ceiling on how many bytes are read.
 *
 * For an upstream whose body is not a single array (so `readJsonArrayPrefix`
 * does not apply) but which can still answer with megabytes. Unlike the array
 * reader this one THROWS when the cap is hit, because a truncated prefix of an
 * arbitrary JSON document is not parseable and there is no partial answer to
 * hand back. A declared `Content-Length` over the cap is refused before a
 * single chunk is read.
 */
async function parseJsonBounded<T>(
  res: Response,
  name: string,
  maxBytes: number = DEFAULT_MAX_JSON_BYTES,
): Promise<T> {
  const declaredRaw = Number(res.headers.get('content-length'));
  const declared = Number.isFinite(declaredRaw) && declaredRaw > 0 ? declaredRaw : null;

  const tooBig = (n: number) =>
    new Error(
      `upstream_down: ${name} answered with ${n.toLocaleString()} bytes, over this pack's ${maxBytes.toLocaleString()}-byte ceiling. ` +
        'The body is not read past the ceiling on purpose — a few concurrent reads of a body that size exhaust the ' +
        'Worker isolate and take every other in-flight request down with them. Narrow the request (a smaller range, ' +
        'a specific id, or a lower limit) and retry.',
    );

  if (declared !== null && declared > maxBytes) {
    await res.body?.cancel().catch(() => {});
    throw tooBig(declared);
  }
  if (!res.body) return parseJson<T>(res, name);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let raw = '';
  let bytesRead = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) throw tooBig(bytesRead);
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
  }

  if (!raw.trim()) {
    throw new Error(
      `upstream_down: ${name} answered HTTP ${res.status} with an EMPTY body where JSON was expected. ` +
        'Nothing about the request can cause this — it is an upstream fault, and the same call may well work on retry.',
    );
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(
      `upstream_down: ${name} answered HTTP ${res.status} with a body that is not valid JSON. ` +
        `It begins: ${stripMarkup(raw).slice(0, 120) || '(unreadable)'}`,
    );
  }
}
/**
 * Algorithm Finder MCP — which algorithm, data structure or technique fits a
 * computational problem: the standard textbook answer with its preconditions
 * and complexity bounds, and the recent research answer with dates.
 *
 * Data sources (every result carries its source URL and `data_as_of`):
 *  - NIST Dictionary of Algorithms and Data Structures (DADS), Paul E. Black
 *    ed., https://xlinux.nist.gov/dads/ — ~1,120 entries: definition, aliases,
 *    relations (generalization / specialization / part-of), complexity notes,
 *    implementation links. A work of the US Government (17 U.S.C. § 105).
 *  - A curated methods table written for this pack: what each method solves,
 *    its preconditions, bounds (with their kind: worst-case / expected /
 *    amortized) and when to prefer it, each fact cited to the textbook page it
 *    was established from (CLRS 4th ed.; Erciyes, Guide to Graph Algorithms
 *    2nd ed.; Bhargava, Grokking Algorithms; Christian & Griffiths, Algorithms
 *    to Live By). Facts only, in our own words — no book text is served.
 *  - Skiena's Algorithm Repository, https://www.algorist.com/ — 75 problem
 *    pages linking problems to methods and implementations (proxied per call).
 *  - cp-algorithms.com — competitive-programming articles (CC BY-SA 4.0, proxied).
 *  - Rosetta Code, https://rosettacode.org/ — implementations of a named task
 *    in many languages (CC BY-SA 4.0, proxied per call).
 *  - Hugging Face Papers (huggingface.co/api/papers/search) and arXiv
 *    (export.arxiv.org Atom API) for the recent-research leg, called directly.
 *
 * The DADS / Skiena / cp-algorithms index and the curated table are a
 * generated module (src/af-index-data.ts, written by
 * scripts/bake-algorithm-finder-index.mjs) that the gateway injects as
 * `args._bakedIndex` (workers/gateway/src/pack-baked-indexes.json). NEVER
 * value-import that module here — a type-only import is erased, a value import
 * puts the whole table into every isolate.
 *
 * Tools:
 *  - algorithm_find             problem text -> common (textbook) + novel (recent papers) methods
 *  - algorithm_lookup           one named method in full: curated facts, DADS entry, related pages
 *  - algorithm_implementations  implementations of a named method, by language
 */

import type { DadsEntry, SkienaProblem, CpaPage, Method, MethodBound, ConstraintDef, ConstraintValue } from './af-index-data.js';

const UA = 'pipeworx-mcp-algorithm-finder/1.0 (+https://pipeworx.io)';

async function afFetch(url: string | URL, upstream: string, init?: RequestInit, timeoutMs?: number): Promise<Response> {
  const headers = { 'User-Agent': UA, Accept: 'application/json, text/html;q=0.9, */*;q=0.8', ...(init?.headers ?? {}) };
  return timeoutMs ? fetchWithTimeout(url, { ...init, headers }, upstream, timeoutMs) : fetchWithTimeout(url, { ...init, headers }, upstream);
}

// ───────────────────────── licences ─────────────────────────

const DADS_LICENSE: LicenseTerms = {
  id: 'LicenseRef-US-Gov-Works-17USC105',
  kind: 'public_domain_us_gov' as LicenseTerms['kind'],
  url: 'https://www.law.cornell.edu/uscode/text/17/105',
  attribution: 'Paul E. Black, ed., Dictionary of Algorithms and Data Structures [online], NIST, https://www.nist.gov/dads/',
  obligations: [],
};
const ROSETTA_LICENSE = creativeCommonsLicense('CC-BY-SA-4.0', 'Rosetta Code contributors, https://rosettacode.org/');
const CPA_LICENSE = creativeCommonsLicense('CC-BY-SA-4.0', 'cp-algorithms.com contributors, https://cp-algorithms.com/');
const SKIENA_SOURCE = 'Steven Skiena, The Stony Brook Algorithm Repository, https://www.algorist.com/';

// ───────────────────────── baked index ─────────────────────────

interface Index {
  dads: DadsEntry[];
  skiena: SkienaProblem[];
  cpa: CpaPage[];
  methods: Method[];
  data_as_of: string;
  vocab: Record<string, ConstraintDef>;
  /** Rarity weight per query token (fleet #2850): ~1 for a typical word, low for "find"/"time"/"search", high for "deduplicate". */
  idf: Map<string, number>;
  // derived once per isolate
  dadsByKey: Map<string, DadsEntry>;
  methodByKey: Map<string, Method>;
  methodById: Map<string, Method>;
}

let INDEX: Index | null = null;
let INDEX_SRC: unknown = null;

function ensureIndex(args: Record<string, unknown>): Index {
  const raw = args._bakedIndex as Record<string, unknown> | null | undefined;
  // The gateway injects the same parsed object on every call into this isolate, so this is a
  // pointer comparison; a different object (a new deploy's index, or a test's mutated copy) rebuilds.
  if (INDEX && raw === INDEX_SRC) return INDEX;
  const dads = raw?.DADS_ENTRIES as DadsEntry[] | undefined;
  const skiena = raw?.SKIENA_PROBLEMS as SkienaProblem[] | undefined;
  const cpa = raw?.CPA_PAGES as CpaPage[] | undefined;
  const methods = raw?.METHODS as Method[] | undefined;
  const data_as_of = raw?.DATA_AS_OF as string | undefined;
  const vocab = (raw?.CONSTRAINT_VOCAB ?? {}) as Record<string, ConstraintDef>;
  if (!Array.isArray(dads) || dads.length < 500 || !Array.isArray(methods) || !Array.isArray(skiena) || !Array.isArray(cpa) || !data_as_of) {
    // Loud by design: a missing index would otherwise answer "no match" to every question.
    throw new Error(
      `algorithm-finder: index unavailable (DADS ${Array.isArray(dads) ? dads.length : 'absent'} entries, methods ${Array.isArray(methods) ? methods.length : 'absent'}); ` +
        'the generated index (static-json:baked-index:algorithm-finder) was not injected. Retry; if it persists this is a deploy defect, not an answer.',
    );
  }
  const dadsByKey = new Map<string, DadsEntry>();
  for (const e of dads) {
    dadsByKey.set(key(e.name), e);
    for (const a of e.aliases) if (!dadsByKey.has(key(a))) dadsByKey.set(key(a), e);
  }
  const methodByKey = new Map<string, Method>();
  const methodById = new Map<string, Method>();
  for (const m of methods) {
    methodById.set(m.id, m);
    methodByKey.set(key(m.name), m);
    for (const a of m.aliases) if (!methodByKey.has(key(a))) methodByKey.set(key(a), m);
  }
  INDEX = { dads, skiena, cpa, methods, data_as_of, vocab, idf: buildIdf(methods, dads), dadsByKey, methodByKey, methodById };
  INDEX_SRC = raw;
  return INDEX;
}

// ───────────────────────── text matching ─────────────────────────

const STOP = new Set(['a', 'an', 'the', 'of', 'in', 'on', 'for', 'to', 'and', 'or', 'with', 'without', 'is', 'are', 'be', 'by', 'from', 'that', 'this', 'it', 'as', 'at', 'into', 'all', 'any', 'each', 'given', 'find', 'finding', 'compute', 'computing', 'problem', 'algorithm', 'algorithms', 'method', 'methods', 'i', 'we', 'need', 'want', 'how', 'what', 'which', 'best', 'way', 'ways', 'using', 'use', 's', 'between', 'over', 'set', 'two', 'one']);

/** Normalised key for exact name/alias lookup: lowercase, no punctuation, possessive stripped. */
function key(s: string): string {
  return s
    .toLowerCase()
    .replace(/['’]s\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Light stemmer: plural / -ing / -ed / -ation endings collapse so "sorting" meets "sort". */
function stem(w: string): string {
  if (w.length <= 3) return w;
  return w
    .replace(/ies$/, 'y')
    .replace(/(ations?|ition|ments?|ising|izing|ised|ized)$/, '')
    .replace(/(ing|ed|es|s)$/, '')
    .replace(/(er|est)$/, '');
}

function tokens(s: string): string[] {
  return key(s)
    .split(' ')
    .filter((w) => w && !STOP.has(w))
    .map(stem)
    .filter((w) => w.length > 1);
}

/**
 * Inverse document frequency over every method's name, aliases, what-it-solves and phrasings and
 * every DADS entry's name, aliases and definition, normalised so the median token weighs 1. Without
 * it "find the fastest driving route between two cities on a road map" tied eight ways at one
 * shared word each and Karnaugh map ranked first on "map" (fleet #2850).
 */
function buildIdf(methods: Method[], dads: DadsEntry[]): Map<string, number> {
  const df = new Map<string, number>();
  const docs: string[] = [
    ...methods.map((m) => [m.name, ...m.aliases, m.solves, ...m.phrasings].join(' ')),
    ...dads.map((e) => [e.name, ...e.aliases, e.definition].join(' ')),
  ];
  for (const d of docs) for (const t of new Set(tokens(d))) df.set(t, (df.get(t) ?? 0) + 1);
  const n = docs.length;
  const raw = new Map<string, number>();
  for (const [t, c] of df) raw.set(t, Math.log((n + 1) / (c + 1)));
  const sorted = [...raw.values()].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || 1;
  const idf = new Map<string, number>();
  for (const [t, v] of raw) idf.set(t, v / median);
  return idf;
}

/** Rarity-weighted hits: the sum of the idf of each distinct query token present in the field. */
function whits(idf: Map<string, number>, queryTokens: Set<string>, field: string): number {
  if (!field) return 0;
  const f = new Set(tokens(field));
  let w = 0;
  for (const q of queryTokens) if (f.has(q)) w += idf.get(q) ?? 1.5;
  return Math.round(w * 10) / 10;
}

/** Query-token hits in a field, counted once per distinct query token. */
function hits(queryTokens: Set<string>, field: string): number {
  if (!field) return 0;
  const f = new Set(tokens(field));
  let n = 0;
  for (const q of queryTokens) if (f.has(q)) n++;
  return n;
}

function phraseIn(query: string, field: string): boolean {
  const q = key(query);
  return q.length > 3 && key(field).includes(q);
}

// ───────────────────────── open questions by family ─────────────────────────

const OPEN_QUESTIONS: Record<string, string[]> = {
  'shortest-paths': ['Can any edge weight be negative? (Dijkstra requires non-negative weights; Bellman-Ford does not.)', 'One source, or every pair of vertices?'],
  'graph-traversal': ['Is the graph directed? Weighted? (BFS gives shortest paths only when every edge counts 1.)'],
  'minimum-spanning-tree': ['Is the graph dense or sparse? (Prim with a heap suits dense graphs; Kruskal suits sparse.)'],
  'max-flow': ['Are capacities integral? Is there a cost per unit of flow to minimise as well?'],
  matching: ['Is the graph bipartite? Are edges weighted (assignment) or not (cardinality)?', 'Do you need a maximum matching or just a maximal one?'],
  sorting: ['Does the data fit in memory? Are the keys integers in a small range? Must equal keys keep their order (stability)?'],
  'selection-order-statistics': ['Do you need one order statistic or the whole sorted order?'],
  searching: ['Is the data sorted, and does it change between queries?'],
  hashing: ['Is the key set fixed in advance (perfect hashing) or does it change?'],
  'search-trees': ['Do you need ordered traversal or range queries, or only lookup? (A hash table beats a tree for lookup alone.)'],
  'nearest-neighbor': ['Exact or approximate neighbours? How many dimensions? Is the index static or updated online?'],
  'string-matching': ['One pattern or many at once? Exact matches only, or within some edit distance?'],
  'string-similarity': ['Which edits count (insert, delete, substitute, transpose) and are they weighted?'],
  'dynamic-programming': ['Can the problem be expressed as optimal substructure over overlapping subproblems? How large is the state space?'],
  greedy: ['Does a locally best choice provably lead to a global optimum here, or is greedy only a heuristic for this problem?'],
  'np-hard-approximation': ['Is an exact answer on a small instance acceptable, or do you need a guaranteed approximation ratio, or will a heuristic do?'],
  'linear-programming': ['Are the variables continuous, or must some be integers (which makes it integer programming)?'],
  scheduling: ['One machine or several? Is preemption allowed? What is the objective: lateness, makespan, number of late jobs, or fairness?'],
  'online-caching': ['Is the access sequence known in advance (offline) or revealed one request at a time (online)?'],
  'optimal-stopping': ['Can you return to a rejected option? Do you know the distribution of values, or only relative ranks?'],
  'bandits-exploration': ['How long is the horizon? Do the arms\' payoffs change over time?'],
  'dynamic-graph': ['Are edges only inserted, or deleted too? (Deletions are the hard case.)'],
  geometry: ['Are the inputs in two dimensions or higher? Are degenerate cases (collinear points) possible?'],
  'number-theory': ['How large are the integers: machine words or arbitrary precision?'],
  'combinatorial-optimization': ['How should fairness be measured: equal counts of undesirable assignments, minimise the worst-off person, or minimise variance? Each is a different objective.', 'Do you need a provably optimal schedule, or is a good feasible one enough? (CP-SAT/MIP can prove optimality; heuristics only find feasible answers.)', 'Are any rules hard (must hold) versus soft (preferences with a penalty)?'],
  randomized: ['Is a small probability of a wrong answer acceptable (Monte Carlo), or only variable running time (Las Vegas)?'],
};

// ───────────────────────── the find tool ─────────────────────────

interface CommonHit {
  score: number;
  method: Method | null;
  dads: DadsEntry | null;
  why: string[];
  /** Set when this hit was kept past the coherence/relative cuts only as a named, conditional
   * alternative to the leader (fleet #2855) -- e.g. a flow formulation that only applies "if the
   * rules can be simplified enough." Never set for a hit that earned its place on score alone. */
  conditional?: string;
}

// Side-constraint language (fleet #2850). "Assign people to shifts" alone is linear assignment;
// add minimum staffing, skills, availability or fairness and it is a constrained model that the
// Hungarian algorithm cannot express. Two or more of these phrases alongside assignment or
// scheduling words move the answer to constraint programming / MIP. A rule table, not a model.
const SIDE_CONSTRAINT_RE = /\b(minimum|maximum|at least|at most|no more than|skills?|availab\w*|fair\w*|evenly|balanced?|preferences?|rules?|cannot|must not|consecutive|rest|overtime|capacity|quota|coverage|staffing|seniority)\b/gi;
const ASSIGNMENT_WORDS_RE = /\b(assign\w*|allocat\w*|schedul\w*|roster\w*|shifts?|rota|timetabl\w*)\b/i;

function sideConstraintFactor(problem: string, m: Method): number {
  if (!ASSIGNMENT_WORDS_RE.test(problem)) return 1;
  const n = new Set((problem.match(SIDE_CONSTRAINT_RE) ?? []).map((w) => w.toLowerCase())).size;
  if (n < 2) return 1;
  if (m.family === 'combinatorial-optimization') return 1.8;
  if (m.family === 'matching' || m.family === 'scheduling') return 0.6;
  return 1;
}

/**
 * Bruce's own worked example for this pack (fleet #2855): "Recommended approach: constraint
 * programming ... Alternative: a flow formulation if the rules can be simplified enough." When
 * the side-constraint rule above promotes an assignment/scheduling method to the lead, its own
 * named `alternatives` in the curated table should survive the family-coherence and relative-score
 * cuts that would otherwise drop them -- a same-family alternative (CP-SAT's peer MIP) returns as
 * a full candidate on its own merits; a cross-family one (a flow formulation) returns tagged
 * `conditional`, because it is only the answer once the side constraints are simple enough to fit
 * a plain flow/assignment shape -- never a plain, unqualified fit the way CP-SAT or MIP are.
 * Fires only when the side-constraint rule itself fired for the LEADER, so it cannot leak
 * alternatives into a problem that never tripped the boost (e.g. "solve a Sudoku puzzle").
 */
function pullNamedAlternatives(idx: Index, problem: string, ranked: CommonHit[], out: Map<string, CommonHit>): CommonHit[] {
  const leader = ranked[0];
  if (!leader?.method || sideConstraintFactor(problem, leader.method) <= 1) return ranked;
  const have = new Set(ranked.map((h) => h.method?.id).filter((id): id is string => !!id));
  for (const altId of leader.method.alternatives) {
    if (have.has(altId)) continue;
    const altMethod = idx.methodById.get(altId);
    if (!altMethod) continue;
    const sameFamily = altMethod.family === leader.method.family;
    const existing = out.get(`m:${altId}`);
    // A same-family peer with no prior score at all (MIP, for this exact wording) is still a real
    // textbook alternative, not noise -- rank it just under the leader rather than inventing a
    // precise score nobody computed. A cross-family alternative ranks lower still, reflecting that
    // it is conditional rather than a direct competitor.
    const score = existing ? existing.score : Math.round(leader.score * (sameFamily ? 0.9 : 0.3));
    const why = [...(existing?.why ?? []), `named as ${leader.method.name}'s alternative in the curated table`];
    const hit: CommonHit = { score, method: altMethod, dads: existing?.dads ?? idx.dadsByKey.get(key(altMethod.name)) ?? null, why };
    if (!sameFamily) hit.conditional = "the alternative if the rules can be simplified enough to fit a plain flow/assignment model";
    ranked.push(hit);
    have.add(altId);
  }
  return ranked.sort((a, b) => b.score - a.score);
}

// Everyday words -> the textbook vocabulary the method table is written in (fleet #2850). The
// question keeps its own words; these are ADDED so "driving route between cities" also reaches
// "path between vertices". A small rule table, extended when a harness prose case needs it.
const SYNONYMS: Record<string, string[]> = {
  route: ['path'], driv: ['path'], road: ['path'], navigat: ['path'], directions: ['path'], citi: ['vertex', 'node'], city: ['vertex', 'node'],
  keyword: ['pattern'], term: ['pattern'], log: ['text'], document: ['text'],
  dedupl: ['duplicate'], deduplicate: ['duplicate'], dedup: ['duplicate'], duplicat: ['duplicate'], misspell: ['similar', 'string'], spell: ['similar', 'string'],
  embedd: ['vector'], embedding: ['vector'], image: ['vector'],
  shift: ['schedule'], roster: ['schedule'], staff: ['schedule'],
  late: ['due', 'lateness'], deadline: ['due'],
  // "how often" and "how many times" are the same idea the methods table writes as "frequency" /
  // "count" -- without this, "most frequent" never reaches Count-Min sketch's own phrasing
  // ("estimate frequency of items...") and the heavy-hitters answer skews to whichever unrelated
  // method happens to share a stray word instead (fleet #2855).
  frequent: ['frequency'], frequency: ['frequent'],
};
function expandTokens(problem: string): Set<string> {
  const base = tokens(problem);
  const out = new Set(base);
  for (const t of base) for (const s of SYNONYMS[t] ?? []) for (const st of tokens(s)) out.add(st);
  return out;
}

function scoreCommon(idx: Index, problem: string): CommonHit[] {
  const q = expandTokens(problem);
  if (q.size === 0) return [];
  const out = new Map<string, CommonHit>();
  const put = (k: string, hit: CommonHit) => {
    const prev = out.get(k);
    if (!prev || prev.score < hit.score) out.set(k, hit);
  };

  for (const m of idx.methods) {
    let score = 0;
    const why: string[] = [];
    if (phraseIn(problem, m.name) || m.aliases.some((a) => phraseIn(problem, a))) {
      score += 60;
      why.push('named in the question');
    }
    const ph = Math.max(0, ...m.phrasings.map((p) => whits(idx.idf, q, p)));
    if (ph) {
      score += 18 * ph;
      why.push(`matches a known phrasing of the problem (weight ${ph})`);
    }
    // The whole question inside a phrasing, or a whole phrasing inside the question, beats token overlap.
    if (m.phrasings.some((p) => phraseIn(problem, p) || phraseIn(p, problem))) {
      score += 30;
      why.push('a known phrasing of the problem matches the question as a whole');
    }
    const ps = whits(idx.idf, q, m.solves);
    if (ps) {
      score += 10 * ps;
      why.push(`what it solves matches (weight ${ps})`);
    }
    const pn = whits(idx.idf, q, m.name + ' ' + m.aliases.join(' '));
    if (pn) score += 8 * pn;
    const pf = whits(idx.idf, q, m.family.replace(/-/g, ' '));
    if (pf) score += 4 * pf;
    score = Math.round(score * sideConstraintFactor(problem, m));
    if (score > 0) put(`m:${m.id}`, { score, method: m, dads: idx.dadsByKey.get(key(m.name)) ?? m.aliases.map((a) => idx.dadsByKey.get(key(a))).find(Boolean) ?? null, why });
  }

  for (const e of idx.dads) {
    let score = 0;
    const why: string[] = [];
    if (phraseIn(problem, e.name) || e.aliases.some((a) => phraseIn(problem, a))) {
      score += 50;
      why.push('named in the question');
    }
    const pn = whits(idx.idf, q, e.name + ' ' + e.aliases.join(' '));
    if (pn) {
      score += 12 * pn;
      why.push(`name matches (weight ${pn})`);
    }
    const pd = whits(idx.idf, q, e.definition);
    if (pd) {
      score += 4 * pd;
      why.push(`definition matches (weight ${pd})`);
    }
    score = Math.round(score);
    if (e.type === 'algorithm') score += 3;
    else if (e.type === 'data structure') score += 1;
    // A bare "definition" entry (565 of 1,123 — "work", "total order") that matches only on its
    // definition text is noise; it needs its name in the question.
    if (!/^(algorithm|data structure|algorithmic technique|classic problem)$/.test(e.type) && pn === 0 && !why.includes('named in the question')) continue;
    if (score < 12) continue;
    // If a curated method already claims this DADS entry, fold the score into it rather than listing twice.
    const m = idx.methodByKey.get(key(e.name)) ?? e.aliases.map((a) => idx.methodByKey.get(key(a))).find(Boolean) ?? null;
    if (m) {
      const prev = out.get(`m:${m.id}`);
      if (prev) {
        prev.score += Math.round(score / 2);
        if (!prev.dads) prev.dads = e;
        continue;
      }
      put(`m:${m.id}`, { score, method: m, dads: e, why });
      continue;
    }
    put(`d:${e.id}`, { score, method: null, dads: e, why });
  }

  // A question usually names the PROBLEM ("all-pairs shortest paths"), and DADS files the
  // algorithms for it under the problem entry's see-also / specialization links. Expand each
  // problem-shaped hit into those linked algorithms and data structures, scored just under the
  // problem itself, so the answer leads with Floyd-Warshall and Johnson rather than with the
  // definition of the problem.
  const dadsById = new Map(idx.dads.map((e) => [e.id, e]));
  for (const hit of [...out.values()]) {
    const e = hit.dads;
    if (!e || hit.method) continue;
    if (!/problem|definition/.test(e.type)) continue;
    const linked = [...e.see_also, ...e.specialization, ...e.aggregate_child];
    for (const l of linked) {
      const t = dadsById.get(l.id);
      if (!t || !/^(algorithm|algorithmic technique)$/.test(t.type)) continue;
      const score = Math.round(hit.score * 0.95) + 10;
      const why = [`listed under the problem "${e.name}" in NIST DADS`];
      const m = idx.methodByKey.get(key(t.name)) ?? t.aliases.map((a) => idx.methodByKey.get(key(a))).find(Boolean) ?? null;
      const k = m ? `m:${m.id}` : `d:${t.id}`;
      const prev = out.get(k);
      if (prev) {
        // Already matched directly; the relation is corroboration, not a second match.
        prev.score += 8;
        prev.why.push(why[0]);
        if (!prev.dads) prev.dads = t;
      } else out.set(k, { score, method: m, dads: t, why });
    }
  }
  let ranked = [...out.values()].sort((a, b) => b.score - a.score);
  // Family coherence (fleet #2850): a family whose best row scores under 50% of the leader is a
  // stray token match ("records" pulling in small-world networks), so drop it, and drop DADS-only
  // rows under 50% too. The leader's own family is always kept.
  if (ranked.length) {
    const top = ranked[0].score;
    const famBest = new Map<string, number>();
    for (const h of ranked) {
      const f = h.method?.family ?? `dads:${h.dads?.id ?? ''}`;
      famBest.set(f, Math.max(famBest.get(f) ?? 0, h.score));
    }
    ranked = ranked.filter((h) => (famBest.get(h.method?.family ?? `dads:${h.dads?.id ?? ''}`) ?? 0) >= top * 0.5);
  }
  // Relative cutoff: once there is a clear leader, token-overlap stragglers at under 40% of its
  // score ("Chinese remainder theorem" for a scheduling question) are noise, not candidates.
  const top = ranked[0]?.score ?? 0;
  ranked = top >= 60 ? ranked.filter((h) => h.score >= top * 0.4) : ranked;
  return pullNamedAlternatives(idx, problem, ranked, out);
}

function skienaFor(idx: Index, problem: string, familyNames: string[]): SkienaProblem[] {
  const q = new Set([...tokens(problem), ...familyNames.flatMap((f) => tokens(f.replace(/-/g, ' ')))]);
  return idx.skiena
    .map((p) => ({ p, n: hits(q, p.name) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 4)
    .map((x) => x.p);
}

function cpaFor(idx: Index, names: string[]): CpaPage[] {
  const out: CpaPage[] = [];
  for (const n of names) {
    const k = key(n);
    const page = idx.cpa.find((p) => key(p.title) === k) ?? idx.cpa.find((p) => key(p.title).includes(k) || k.includes(key(p.title)));
    if (page && !out.includes(page)) out.push(page);
  }
  return out;
}

/** Book cites read "CLRS4 ch. 22.3 p. pdf:808"; paper / docs / web cites carry their title and URL. */
function citeText(c: { book: string; chapter: string; page: string; title?: string; url?: string }): string {
  if (c.url) return `${c.title ?? c.book}${c.chapter && c.chapter !== '-' ? `, ${c.chapter}` : ''}${c.page && c.page !== '-' ? `, p. ${c.page}` : ''} <${c.url}>`;
  return `${c.book} ch. ${c.chapter} p. ${c.page}`;
}

function boundsView(b: MethodBound[]): Array<Record<string, unknown>> {
  return b.map((x) => ({
    quantity: x.quantity,
    bound: x.expr || null,
    kind: x.kind,
    variables: x.variables || undefined,
    conditions: x.conditions || undefined,
    cite: x.cite ? citeText(x.cite) : undefined,
  }));
}

function dadsView(e: DadsEntry): Record<string, unknown> {
  return {
    name: e.name,
    type: e.type,
    definition: e.definition,
    aliases: e.aliases,
    complexity_note: e.note || undefined,
    bounds_mentioned: e.bounds.length ? e.bounds : undefined,
    generalization: e.generalization.map((l) => l.name),
    specialization: e.specialization.map((l) => l.name),
    used_in: e.aggregate_parent.map((l) => l.name),
    uses: e.aggregate_child.map((l) => l.name),
    see_also: e.see_also.map((l) => l.name),
    reference: e.cite ? e.cite.text : undefined,
    implementation_links: e.implementations,
    more_information: e.more_information,
    entry_modified: e.entry_modified,
    url: e.url,
  };
}

function commonRow(idx: Index, h: CommonHit): Record<string, unknown> {
  const m = h.method;
  const d = h.dads;
  const name = m?.name ?? d?.name ?? '';
  const cpa = cpaFor(idx, [name, ...(m?.aliases ?? []), ...(d?.aliases ?? [])]);
  return {
    name,
    id: m?.id,
    kind: m?.kind ?? d?.type ?? 'unknown',
    family: m?.family,
    solves: m?.solves ?? d?.definition,
    preconditions: m?.preconditions,
    guarantee: m?.guarantee,
    bounds: m ? boundsView(m.bounds) : d?.bounds.length ? d.bounds.map((b) => ({ bound: b, kind: 'as stated in DADS note', cite: 'NIST DADS' })) : undefined,
    when_to_use: m?.when_to_use,
    when_not: m?.when_not,
    alternatives: m?.alternatives.map((id) => idx.methodById.get(id)?.name ?? id),
    conditional: h.conditional,
    why_matched: h.why,
    dads: d ? { definition: d.definition, complexity_note: d.note || undefined, see_also: d.see_also.map((l) => l.name), url: d.url } : undefined,
    cp_algorithms: cpa.length ? cpa.map((p) => ({ title: p.title, url: p.url })) : undefined,
    citations: m?.citations.map((c) => citeText(c)),
    source: m ? 'curated table (book-cited) + NIST DADS' : 'NIST DADS',
    _score: h.score,
  };
}

interface NovelPaper {
  title: string;
  date: string | null;
  year: number | null;
  authors: string[];
  url: string;
  summary?: string;
  upvotes?: number;
  repo?: string | null;
  source: 'huggingface-papers' | 'arxiv';
  /** Full title + abstract for method-name mining; never serialised. */
  _text?: string;
}

function yearOf(s: unknown): number | null {
  if (typeof s !== 'string') return null;
  const m = /^(\d{4})/.exec(s);
  return m ? Number(m[1]) : null;
}

interface NovelMethod {
  name: string;
  mentions: number;
  first_seen: number | null;
  last_seen: number | null;
  example_paper: { title: string; date: string | null; url: string };
}

// Tokens that look like method names but are not (fields, hardware, generic acronyms).
const NOT_A_METHOD = new Set(['ANN', 'ANNS', 'KNN', 'NN', 'LLM', 'LLMS', 'GPU', 'GPUS', 'CPU', 'CPUS', 'AI', 'ML', 'NLP', 'CV', 'API', 'SOTA', 'RAG', 'IR', 'DB', 'SQL', 'RL', 'RLHF', 'GNN', 'GNNS', 'CNN', 'RNN', 'DNN', 'DL', 'HPC', 'IO', 'I/O', 'RAM', 'SSD', 'SIMD', 'FPGA', 'TPU', 'OOD', 'OOM', 'NP', 'P', 'APSP', 'SSSP', 'MST', 'TSP', 'SAT', 'LP', 'ILP', 'MIP', 'DP', 'FFT', 'LSH', 'PQ', 'SIFT', 'GIST', 'USA', 'US', 'UK', 'EU', 'IEEE', 'ACM', 'ARXIV', 'ICML', 'NEURIPS', 'ICLR', 'KDD', 'VLDB', 'SIGMOD', 'WWW', 'AAAI', 'IJCAI', 'ICDE', 'SIGIR', 'ECCV', 'CVPR', 'MIT', 'PHD', 'ABS', 'VS', 'VIA', 'AND', 'OR', 'NOT', 'FOR', 'THE', 'WITH', 'FROM', 'INTO', 'USING', 'TOWARDS', 'BEYOND', 'ON', 'OF', 'IN', 'AT', 'TO', 'BY', 'A', 'AN', 'IS', 'ARE', 'LOG', 'SOTA', 'PART', 'TOP', 'NEW', 'FAST', 'BIG', 'LARGE', 'SMALL', 'OPEN', 'FREE', 'END', 'ZERO', 'ONE', 'TWO', 'HIGH', 'LOW', 'REAL', 'ALL', 'ANY', 'QA', 'OCR', 'BERT', 'GPT', 'CLIP', 'VIT', 'LORA', 'MOE', 'JSON', 'XML', 'HTML', 'HTTP', 'REST', 'GRPC', 'C++', 'RUST', 'JAVA', 'GO', 'PYTHON', 'CUDA']);

const VENUES = new Set(['STOC', 'SODA', 'FOCS', 'SICOMP', 'TALG', 'ICALP', 'ESA', 'PODC', 'SPAA', 'DISC', 'JACM', 'ITCS', 'SOSA', 'APPROX', 'RANDOM', 'CCC', 'LICS', 'PODS', 'ICDT', 'EDBT', 'CIKM', 'WSDM', 'RECSYS', 'EMNLP', 'NAACL', 'COLING', 'INTERSPEECH', 'ICASSP', 'MICCAI', 'TPAMI', 'JMLR', 'TODS', 'TKDE', 'PVLDB', 'CACM', 'TOMS', 'SIAM', 'ACL', 'OSDI', 'SOSP', 'NSDI', 'USENIX', 'ATC', 'ISCA', 'MICRO', 'ASPLOS', 'PPOPP', 'SC', 'IPDPS', 'EUROPAR', 'HPCA', 'DAC', 'ICCAD', 'GECCO', 'AISTATS', 'UAI', 'COLT', 'ALT', 'MLSYS', 'QPS', 'ARXIV']);

/**
 * Method names that recur across the ABSTRACTS of the papers for a problem: all-caps or
 * CamelCase tokens ("HNSW", "DiskANN", "RaBitQ", "MinHash"), counted by the number of distinct
 * papers that mention them, with first/last year. Titles alone miss the standard names — the
 * top Hugging Face hit for nearest-neighbour search spells out "Hierarchical Navigable Small
 * World" in its title and says "HNSW" only in the abstract. This is how a modern standard that
 * no textbook covers gets named without a method taxonomy upstream.
 */
function mineMethodNames(all: NovelPaper[]): NovelMethod[] {
  const seen = new Map<string, NovelMethod & { _k: string }>();
  for (const p of all) {
    const text = (p._text ?? p.title).replace(/\$[^$]*\$/g, ' ');
    const found = new Set<string>();
    for (const m of text.matchAll(/(?<![\w-])([A-Z][A-Za-z0-9]*[A-Z][A-Za-z0-9+]*|[A-Z]{3,}[0-9+]*|[A-Z][a-z]+[A-Z][A-Za-z0-9]+)(?![\w-])/g)) {
      const raw = m[1];
      const up = raw.toUpperCase();
      // Drop venues (STOC'23), bibliography keys (ARKP18) and bare numbers.
      if (NOT_A_METHOD.has(up) || VENUES.has(up) || up.length < 3 || up.length > 14 || /^[0-9]+$/.test(up) || /^[A-Z]{2,6}[0-9]{2}$/.test(up)) continue;
      found.add(raw);
    }
    for (const name of found) {
      const k = name.toUpperCase();
      const cur = seen.get(k);
      if (cur) {
        cur.mentions++;
        if (p.year != null) {
          cur.first_seen = cur.first_seen == null ? p.year : Math.min(cur.first_seen, p.year);
          cur.last_seen = cur.last_seen == null ? p.year : Math.max(cur.last_seen, p.year);
        }
      } else {
        seen.set(k, { _k: k, name, mentions: 1, first_seen: p.year, last_seen: p.year, example_paper: { title: p.title, date: p.date, url: p.url } });
      }
    }
  }
  return [...seen.values()]
    .filter((m) => m.mentions >= 2)
    .sort((a, b) => b.mentions - a.mentions || (b.last_seen ?? 0) - (a.last_seen ?? 0))
    .slice(0, 12)
    .map(({ _k: _unused, ...m }) => m);
}

// ───────────────────────── upstream research sources (called directly so the pack stands alone) ─────────────────────────

function xmlTag(body: string, tag: string): string | null {
  const m = body.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? m[1] : null;
}
function xmlDecode(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
}
function collapse(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** arXiv Atom API (export.arxiv.org), relevance order. Throws on transport or HTTP failure. */
async function searchArxiv(query: string, max: number, timeoutMs?: number): Promise<NovelPaper[]> {
  const u = new URL('https://export.arxiv.org/api/query');
  u.searchParams.set('search_query', query);
  u.searchParams.set('start', '0');
  u.searchParams.set('max_results', String(max));
  const res = await afFetch(u, 'arXiv', { headers: { Accept: 'application/atom+xml' } }, timeoutMs);
  if (!res.ok) throw await httpError(res, 'arXiv');
  const xml = await res.text();
  if (!xml.includes('<feed')) throw new Error('arXiv: response was not an Atom feed');
  const out: NovelPaper[] = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const body = m[1];
    const idUrl = collapse(xmlTag(body, 'id') ?? '');
    const id = idUrl.replace(/^https?:\/\/arxiv\.org\/abs\//, '');
    const abs = body.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/)?.[1] ?? (id ? `https://arxiv.org/abs/${id}` : idUrl);
    const title = collapse(xmlDecode(xmlTag(body, 'title') ?? ''));
    const summary = collapse(xmlDecode(xmlTag(body, 'summary') ?? ''));
    const date = collapse(xmlTag(body, 'published') ?? '') || null;
    const authors = [...body.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>/g)].map((a) => collapse(xmlDecode(a[1]))).slice(0, 6);
    out.push({ title, date, year: yearOf(date), authors, url: abs, summary: summary.slice(0, 400) || undefined, source: 'arxiv', _text: `${title}. ${summary}` });
  }
  return out;
}

interface HfSearchItem {
  paper?: { id?: string; title?: string; summary?: string; ai_summary?: string; publishedAt?: string; upvotes?: number; githubRepo?: string | null; authors?: Array<{ name?: string }> };
  title?: string;
  summary?: string;
  publishedAt?: string;
}

/** Hugging Face Papers search (the successor to Papers with Code), relevance order. Throws on failure. */
async function searchHfPapers(query: string, max: number): Promise<NovelPaper[]> {
  const res = await afFetch(`https://huggingface.co/api/papers/search?q=${encodeURIComponent(query)}`, 'Hugging Face Papers', { headers: { Accept: 'application/json' } });
  if (!res.ok) throw await httpError(res, 'Hugging Face Papers');
  const items = (await res.json()) as HfSearchItem[];
  if (!Array.isArray(items)) throw new Error('Hugging Face Papers: response was not a list');
  return items.slice(0, max).map((it) => {
    const p = it.paper ?? {};
    const title = collapse(p.title ?? it.title ?? '');
    const summary = collapse(p.summary ?? it.summary ?? '');
    const date = p.publishedAt ?? it.publishedAt ?? null;
    const repo = p.githubRepo ? (/^https?:/.test(p.githubRepo) ? p.githubRepo : `https://github.com/${p.githubRepo}`) : null;
    return {
      title,
      date,
      year: yearOf(date),
      authors: (p.authors ?? []).map((a) => a.name).filter((n): n is string => !!n).slice(0, 6),
      url: p.id ? `https://huggingface.co/papers/${p.id}` : '',
      summary: (p.ai_summary || summary).slice(0, 400) || undefined,
      upvotes: typeof p.upvotes === 'number' ? p.upvotes : undefined,
      repo,
      source: 'huggingface-papers' as const,
      _text: `${title}. ${summary} ${p.ai_summary ?? ''}`,
    };
  });
}

async function novelLeg(problem: string, sinceYear: number, limit: number): Promise<{ papers: NovelPaper[]; methods: NovelMethod[]; failed: string[]; counts?: Record<string, number | null> }> {
  const failed: string[] = [];
  const cats = '(cat:cs.DS OR cat:cs.CC OR cat:cs.DM OR cat:cs.LG OR cat:cs.IR OR cat:cs.NE OR cat:cs.DB)';
  const phrase = `all:"${problem.replace(/"/g, '')}" AND ${cats}`;
  // An exact phrase is the most precise query, but a British spelling or one extra word ("nearest
  // neighbour search in embeddings") matches nothing — measured live 2026-10-08: 0 arXiv papers
  // with no error, a silent zero. When the phrase finds nothing, require each content word instead.
  const terms = [...new Set(key(problem).split(' ').filter((w) => w.length > 2 && !STOP.has(w)))].slice(0, 6);
  const relaxed = terms.length >= 2 ? `${terms.map((t) => `all:${t.replace(/our$/, 'or')}`).join(' AND ')} AND ${cats}` : null;
  const arxivLeg = async (): Promise<NovelPaper[]> => {
    // Each attempt is capped so the phrase + relaxed pair fits the answer budget: measured live,
    // the uncapped pair took 23s against a 25s ceiling.
    const first = await searchArxiv(phrase, 50, 11_000);
    if (first.length || !relaxed) return first;
    return searchArxiv(relaxed, 50, 11_000);
  };
  // Both legs in their own RELEVANCE order. Sorting by date instead buried the standard modern
  // methods under this week's preprints.
  const [hf, ax] = await Promise.allSettled([searchHfPapers(problem, 50), arxivLeg()]);
  const out: NovelPaper[] = [];
  if (hf.status === 'fulfilled') out.push(...hf.value);
  else failed.push(`huggingface-papers: ${String(hf.reason?.message ?? hf.reason)}`);
  if (ax.status === 'fulfilled') out.push(...ax.value);
  else failed.push(`arxiv: ${String(ax.reason?.message ?? ax.reason)}`);
  const seen = new Set<string>();
  const dedup = out.filter((p) => {
    const k = key(p.title);
    if (!p.title || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const methods = mineMethodNames(dedup);
  // Interleave the two legs by rank so neither source's ordering dominates, then apply the year window.
  const hfRows = dedup.filter((p) => p.source === 'huggingface-papers' && (p.year == null || p.year >= sinceYear));
  const axRows = dedup.filter((p) => p.source === 'arxiv' && (p.year == null || p.year >= sinceYear));
  const papersOut: NovelPaper[] = [];
  for (let i = 0; papersOut.length < limit && (i < hfRows.length || i < axRows.length); i++) {
    if (i < axRows.length) papersOut.push(axRows[i]);
    if (papersOut.length < limit && i < hfRows.length) papersOut.push(hfRows[i]);
  }
  const counts = { arxiv: ax.status === 'fulfilled' ? ax.value.length : null, 'huggingface-papers': hf.status === 'fulfilled' ? hf.value.length : null };
  return { papers: papersOut.map(({ _text: _unused, ...p }) => p), methods, failed, counts };
}

async function algorithmFind(args: Record<string, unknown>): Promise<unknown> {
  const idx = ensureIndex(args);
  const problem = String(args.problem ?? '').trim();
  if (!problem) throw new Error('problem is required: describe the computational problem in words, e.g. "shortest path from one node to all others with positive weights"');
  const want = (['common', 'novel', 'both'].includes(String(args.want)) ? String(args.want) : 'both') as 'common' | 'novel' | 'both';
  const limit = Math.max(1, Math.min(25, Number(args.limit) || 8));
  const thisYear = new Date().getUTCFullYear();
  const sinceYear = Math.max(1990, Math.min(thisYear, Number(args.since_year) || thisYear - 5));

  const { given, rejected } = parseConstraints(idx, args.constraints);
  const hasConstraints = Object.keys(given).length > 0;
  let commonHits = want === 'novel' ? [] : scoreCommon(idx, problem).slice(0, hasConstraints ? limit * 2 : limit);
  if (hasConstraints) {
    // Keep the retrieval order among equals, but move candidates that violate a stated constraint to the end.
    const viol = (h: CommonHit) => fitOf(h.method, given, idx.vocab).violated.length;
    commonHits = commonHits
      .map((h, i) => ({ h, i, v: viol(h) }))
      .sort((a, b) => (a.v > 0 ? 1 : 0) - (b.v > 0 ? 1 : 0) || a.i - b.i)
      .slice(0, limit)
      .map((x) => x.h);
  }
  const novel = want === 'common' ? { papers: [] as NovelPaper[], methods: [] as NovelMethod[], failed: [] as string[] } : await novelLeg(problem, sinceYear, limit);

  const families = [...new Set(commonHits.map((h) => h.method?.family).filter((f): f is string => !!f))];
  const open_questions = [...new Set(families.flatMap((f) => OPEN_QUESTIONS[f] ?? []))].slice(0, 4);
  // Problem names DADS relates the hits to ("shortest path", "all pairs shortest path") help match Skiena's problem pages.
  const relatedProblemNames = commonHits.flatMap((h) => [...(h.dads?.see_also ?? []), ...(h.dads?.aggregate_parent ?? [])].map((l) => l.name));
  const skiena = want === 'novel' ? [] : skienaFor(idx, problem + ' ' + relatedProblemNames.slice(0, 12).join(' '), families);

  const common = commonHits.map((h) => {
    const row = commonRow(idx, h);
    if (hasConstraints) {
      const f = fitOf(h.method, given, idx.vocab);
      row.fit = { compatible: h.method ? f.violated.length === 0 : undefined, violated: f.violated, unknown: f.unknown, satisfied: f.satisfied, assumes: f.assumes.length ? f.assumes : undefined, checks: f.checks };
    } else if (h.method) {
      row.tier = h.method.tier;
    }
    return row;
  });
  const decisive = want === 'novel' ? [] : decisiveQuestions(idx, commonHits.map((h) => h.method), given);
  const found = common.length > 0 || novel.papers.length > 0;
  const body: Record<string, unknown> = {
    found,
    problem,
    want,
    data_as_of: idx.data_as_of,
    common: want === 'novel' ? undefined : common,
    common_note: want === 'novel' ? undefined : common.length ? 'Ranked by match to the curated methods table (book-cited) and NIST DADS; `bounds[].kind` says whether a bound is worst-case, expected or amortized. Check `preconditions` against your instance before choosing.' : 'No textbook method matched these words. Try naming the structure of the problem (graph, string, array, schedule, assignment) rather than the application, or call algorithm_lookup with a method name.',
    constraints_given: hasConstraints ? given : undefined,
    constraints_rejected: rejected.length ? rejected : undefined,
    decisive_questions: decisive.length ? decisive : undefined,
    open_questions: open_questions.length ? open_questions : undefined,
    problem_pages: skiena.length ? skiena.map((p) => ({ problem: p.name, category: p.category, url: p.url, source: SKIENA_SOURCE })) : undefined,
    novel_methods: want === 'common' ? undefined : novel.methods,
    novel_methods_note: want === 'common' ? undefined : 'Method names that recur in the titles of the papers found for this problem (both legs, all years), with mention count and first/last year seen. A name that recurs across years is the field\'s working vocabulary; look it up with algorithm_lookup or read example_paper.',
    novel: want === 'common' ? undefined : novel.papers,
    novel_sources: want === 'common' ? undefined : novel.counts,
    novel_empty_sources:
      want === 'common'
        ? undefined
        : (() => {
            const empty = Object.entries(novel.counts ?? {}).filter(([, n]) => n === 0).map(([k]) => k);
            return empty.length ? `${empty.join(' and ')} matched nothing for this wording (not an error); fewer or more general words usually help.` : undefined;
          })(),
    novel_note: want === 'common' ? undefined : `Papers since ${sinceYear} from Hugging Face Papers (ML) and arXiv cs.DS/cs.CC/cs.DM/cs.LG/cs.IR/cs.DB, interleaved by each source's relevance rank. A paper's method is a research claim, not a textbook guarantee; read its evaluation before adopting it.`,
    partial: novel.failed.length ? true : undefined,
    failed_sources: novel.failed.length ? novel.failed : undefined,
  };
  if (!found) {
    body.reason = 'no_match';
    body.hint = 'Nothing in the curated table, NIST DADS, Hugging Face Papers or arXiv matched. Describe the problem by its computational shape (e.g. "assign n workers to n jobs minimising total cost") or name a candidate method with algorithm_lookup.';
  }
  return attachLicense(body, DADS_LICENSE);
}

// ───────────────────────── constraint checking ─────────────────────────
//
// A caller states facts about its instance with the keys in data/constraints.json; each curated
// method declares the values it ACCEPTS for the keys that decide whether it applies. The verdict is
// mechanical: caller value in accepts -> satisfied; not in accepts -> violated; key not declared
// by the method -> unknown. Unknown is reported, never guessed — a confident wrong recommendation
// is the failure this tool exists to prevent.

type Verdict = 'satisfied' | 'violated' | 'unknown';

interface ConstraintCheck {
  status: Verdict;
  given: ConstraintValue;
  accepts?: ConstraintValue[];
  why?: string;
}

interface Fit {
  /** Stated facts that match the method's prefer_when: a speed/fit preference, never a correctness verdict. */
  preferred: string[];
  /**
   * Restrictions the method has that the caller did NOT state ("acyclic must be true"). Each is an
   * assumption the recommendation would rest on, so it makes a verdict conditional and ranks the
   * method behind ones that need fewer assumptions.
   */
  assumes: Array<{ constraint: string; requires: ConstraintValue[]; why?: string }>;
  checks: Record<string, ConstraintCheck>;
  satisfied: string[];
  violated: string[];
  unknown: string[];
}

/** Normalise caller constraints against the vocabulary. Unrecognised keys/values are returned, not dropped silently. */
function parseConstraints(idx: Index, raw: unknown): { given: Record<string, ConstraintValue>; rejected: Array<{ key: string; value: unknown; reason: string }> } {
  const given: Record<string, ConstraintValue> = {};
  const rejected: Array<{ key: string; value: unknown; reason: string }> = [];
  if (raw == null) return { given, rejected };
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    rejected.push({ key: '(constraints)', value: raw, reason: 'constraints must be an object of key: value' });
    return { given, rejected };
  }
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const def = idx.vocab[k];
    if (!def) {
      rejected.push({ key: k, value: v, reason: `not in the constraint vocabulary; known keys: ${Object.keys(idx.vocab).join(', ')}` });
      continue;
    }
    if (def.type === 'boolean') {
      const b = v === true || v === 'true' ? true : v === false || v === 'false' ? false : null;
      if (b === null) rejected.push({ key: k, value: v, reason: 'expected true or false' });
      else given[k] = b;
    } else {
      const sv = String(v);
      if (!def.values?.includes(sv)) rejected.push({ key: k, value: v, reason: `expected one of: ${(def.values ?? []).join(', ')}` });
      else given[k] = sv;
    }
  }
  return { given, rejected };
}

function fitOf(m: Method | null, given: Record<string, ConstraintValue>, vocab: Record<string, ConstraintDef> = {}): Fit {
  const fit: Fit = { preferred: [], assumes: [], checks: {}, satisfied: [], violated: [], unknown: [] };
  for (const [k, c] of Object.entries(m?.constraints ?? {})) {
    if (k in given) continue;
    const def = vocab[k];
    const domain: ConstraintValue[] = def ? (def.type === 'boolean' ? [true, false] : (def.values ?? [])) : [];
    if (domain.length && domain.some((v) => !c.accepts.includes(v))) fit.assumes.push({ constraint: k, requires: c.accepts, why: c.why });
  }
  for (const [k, vals] of Object.entries(m?.prefer_when ?? {})) if (k in given && vals.includes(given[k])) fit.preferred.push(k);
  for (const [k, v] of Object.entries(given)) {
    const c = m?.constraints?.[k];
    if (!c) {
      fit.checks[k] = { status: 'unknown', given: v };
      fit.unknown.push(k);
    } else if (c.accepts.includes(v)) {
      fit.checks[k] = { status: 'satisfied', given: v, accepts: c.accepts };
      fit.satisfied.push(k);
    } else {
      fit.checks[k] = { status: 'violated', given: v, accepts: c.accepts, why: c.why };
      fit.violated.push(k);
    }
  }
  return fit;
}

/**
 * Constraints the caller did NOT state that would change which candidates apply: a key that at
 * least one candidate restricts (excludes some value) and that splits the field. Returned as the
 * questions worth asking before choosing.
 */
function decisiveQuestions(idx: Index, candidates: Array<Method | null>, given: Record<string, ConstraintValue>): Array<Record<string, unknown>> {
  const ms = candidates.filter((m): m is Method => !!m);
  const keys = new Set<string>();
  for (const m of ms) for (const k of Object.keys(m.constraints ?? {})) if (!(k in given)) keys.add(k);
  const out: Array<Record<string, unknown>> = [];
  for (const k of keys) {
    const def = idx.vocab[k];
    if (!def) continue;
    const domain: ConstraintValue[] = def.type === 'boolean' ? [true, false] : (def.values ?? []);
    const rulesOut: Record<string, string[]> = {};
    for (const v of domain) {
      const excluded = ms.filter((m) => m.constraints?.[k] && !m.constraints[k].accepts.includes(v)).map((m) => m.name);
      if (excluded.length) rulesOut[String(v)] = excluded;
    }
    if (!Object.keys(rulesOut).length) continue;
    out.push({ constraint: k, question: def.description, if_answer_is: rulesOut });
  }
  // Questions that rule out the most candidates first.
  return out
    .sort((a, b) => Object.values(b.if_answer_is as Record<string, string[]>).flat().length - Object.values(a.if_answer_is as Record<string, string[]>).flat().length)
    .slice(0, 5);
}

// Constraint values a plain-language question already states (fleet #2850). Returned as
// SUGGESTIONS for the caller to confirm and pass back, never applied silently.
const IMPLIED: Array<{ re: RegExp; key: string; value: ConstraintValue; because: string }> = [
  { re: /\bnegative (edge |)(weight|cost)s?\b/i, key: 'negative_weights', value: true, because: 'mentions negative weights or costs' },
  { re: /\bprobabl(y|e)\b|\bfalse positives?\b/i, key: 'false_positives_ok', value: true, because: 'says "probably" / allows false positives' },
  { re: /\bfair(ly|ness)?\b|\bevenly\b/i, key: 'objective', value: 'fairness', because: 'asks for a fair or even distribution' },
  { re: /\bone machine\b|\bsingle machine\b/i, key: 'machines', value: 'single', because: 'one machine' },
  { re: /\bfinish(es)? late\b|\bafter (their|the) due dates?\b|\bnumber of late\b/i, key: 'objective', value: 'num_late_jobs', because: 'counts jobs finishing late' },
  { re: /\b(stream|one pass|too large to store)\b/i, key: 'streaming', value: true, because: 'data arrives as a stream' },
  { re: /\bstable\b|\bkeep (the )?(original )?order\b/i, key: 'stable', value: true, because: 'equal items must keep their order' },
  { re: /\b(embedding|vectors?)\b/i, key: 'dimensions', value: 'high', because: 'embedding vectors are usually high-dimensional' },
  { re: /\bmany (keywords|patterns)\b|\bhundreds of (keywords|patterns)\b|\blist of keywords\b/i, key: 'pattern_count', value: 'many', because: 'searches for many patterns at once' },
  { re: /\b(little|very little|tiny|limited) memory\b|\bwithout storing\b/i, key: 'memory', value: 'tight', because: 'memory is the constraint' },
  { re: /\bno cycles\b|\bacyclic\b|\bdag\b/i, key: 'acyclic', value: true, because: 'the graph has no cycles' },
  { re: /\bapproximate\b|\bgood enough\b|\bnear(ly)? optimal\b/i, key: 'exact', value: false, because: 'an approximate answer is acceptable' },
];

function impliedConstraints(problem: string): Array<{ key: string; value: ConstraintValue; because: string }> {
  const out: Array<{ key: string; value: ConstraintValue; because: string }> = [];
  for (const r of IMPLIED) if (r.re.test(problem) && !out.some((o) => o.key === r.key)) out.push({ key: r.key, value: r.value, because: r.because });
  return out;
}

const TIER_ORDER: Record<string, number> = { core: 0, common: 1, specialized: 2 };

interface Ranked {
  method: Method | null;
  dads: DadsEntry | null;
  name: string;
  fit: Fit;
}

function rankByFit(rows: Ranked[]): Ranked[] {
  return [...rows].sort(
    (a, b) =>
      a.fit.violated.length - b.fit.violated.length ||
      (a.method ? 0 : 1) - (b.method ? 0 : 1) ||
      a.fit.assumes.length - b.fit.assumes.length ||
      b.fit.preferred.length - a.fit.preferred.length ||
      (a.method?.family_rank ?? 99) - (b.method?.family_rank ?? 99) ||
      a.fit.unknown.length - b.fit.unknown.length ||
      b.fit.satisfied.length - a.fit.satisfied.length ||
      (TIER_ORDER[a.method?.tier ?? 'specialized'] ?? 2) - (TIER_ORDER[b.method?.tier ?? 'specialized'] ?? 2),
  );
}

async function algorithmCompare(args: Record<string, unknown>): Promise<unknown> {
  const idx = ensureIndex(args);
  const { given, rejected } = parseConstraints(idx, args.constraints);
  const names = Array.isArray(args.names) ? (args.names as unknown[]).map(String).filter(Boolean) : [];
  const problem = String(args.problem ?? '').trim();
  if (!names.length && !problem) throw new Error('give names (2-10 method names to compare) or problem (a description; the top textbook candidates are compared)');

  const rows: Ranked[] = [];
  const unresolved: string[] = [];
  if (names.length) {
    for (const n of names.slice(0, 10)) {
      const r = resolveName(idx, n);
      if (!r.method && !r.dads) {
        unresolved.push(n);
        continue;
      }
      const name = r.method?.name ?? r.dads?.name ?? n;
      if (rows.some((x) => x.name === name)) continue;
      rows.push({ method: r.method, dads: r.dads, name, fit: fitOf(r.method, given, idx.vocab) });
    }
  } else {
    for (const h of scoreCommon(idx, problem).filter((h) => h.method && h.method.kind !== 'problem').slice(0, 8)) {
      rows.push({ method: h.method, dads: h.dads, name: h.method!.name, fit: fitOf(h.method, given, idx.vocab) });
    }
  }
  if (!rows.length) {
    return attachLicense(
      {
        found: false,
        reason: 'no_match',
        data_as_of: idx.data_as_of,
        unresolved: unresolved.length ? unresolved : undefined,
        hint: names.length ? 'None of the names matched the curated table or NIST DADS; try the common English name, or algorithm_lookup to see what a method is called.' : 'No curated method matched the problem description; describe its computational shape, or pass names.',
      },
      DADS_LICENSE,
    );
  }

  const ranked = rankByFit(rows);
  const compatible = ranked.filter((r) => r.method && r.fit.violated.length === 0);
  const best = compatible[0] ?? null;
  let verdict: 'recommended' | 'conditional' | 'none_compatible' | 'no_constraints';
  if (!Object.keys(given).length) verdict = 'no_constraints';
  else if (!best) verdict = 'none_compatible';
  else if (best.fit.unknown.length || best.fit.assumes.length) verdict = 'conditional';
  else verdict = 'recommended';

  const candidates = ranked.map((r) => ({
    name: r.name,
    id: r.method?.id,
    family: r.method?.family,
    tier: r.method?.tier,
    compatible: r.method ? r.fit.violated.length === 0 : undefined,
    conditional: r.method && r.fit.violated.length === 0 && (r.fit.unknown.length > 0 || r.fit.assumes.length > 0) ? true : undefined,
    assumes: r.fit.assumes.length ? r.fit.assumes : undefined,
    constraints: r.fit.checks,
    violated: r.fit.violated.length ? r.fit.violated : undefined,
    preferred_because: r.fit.preferred.length ? r.fit.preferred.map((k) => `${k}=${String(given[k])}`) : undefined,
    unknown: r.fit.unknown.length ? r.fit.unknown : undefined,
    bounds: r.method ? boundsView(r.method.bounds) : undefined,
    when_to_use: r.method?.when_to_use,
    when_not: r.method?.when_not,
    note: r.method ? undefined : 'Only a NIST DADS entry exists for this name; the curated table has no constraint data for it, so every constraint is unknown.',
  }));

  const winnerText =
    verdict === 'recommended'
      ? `${best!.name}: satisfies every stated constraint.`
      : verdict === 'conditional'
        ? `${best!.name}, IF ${[
            ...best!.fit.assumes.map((a) => `${a.constraint} is ${a.requires.map(String).join(' or ')}`),
            ...(best!.fit.unknown.length ? [`it handles ${best!.fit.unknown.join(', ')} (the table records nothing on ${best!.fit.unknown.length > 1 ? 'those' : 'that'})`] : []),
          ].join('; and ')}.`
        : verdict === 'none_compatible'
          ? 'None of these candidates satisfies every stated constraint; see each one\'s violated list.'
          : 'No constraints were given, so nothing can be ruled out; answer the decisive questions below or pass constraints.';

  return attachLicense(
    {
      found: true,
      verdict,
      winner: verdict === 'recommended' || verdict === 'conditional' ? best!.name : null,
      winner_id: verdict === 'recommended' || verdict === 'conditional' ? best!.method!.id : null,
      summary: winnerText,
      data_as_of: idx.data_as_of,
      constraints_given: given,
      constraints_rejected: rejected.length ? rejected : undefined,
      constraints_implied: (() => {
        const imp = problem ? impliedConstraints(problem).filter((c) => !(c.key in given)) : [];
        return imp.length ? { suggestions: imp, note: 'Read from the wording of problem; not applied. Confirm and pass them in constraints to narrow the verdict.' } : undefined;
      })(),
      unresolved: unresolved.length ? unresolved : undefined,
      candidates,
      open_questions: (() => {
        const fams = [...new Set(ranked.map((r) => r.method?.family).filter((f): f is string => !!f))];
        const q = [...new Set(fams.flatMap((f) => OPEN_QUESTIONS[f] ?? []))].slice(0, 4);
        return q.length ? q : undefined;
      })(),
      decisive_questions: (() => {
        const q = decisiveQuestions(idx, ranked.map((r) => r.method), given);
        return q.length ? q : undefined;
      })(),
      method_note: 'Each constraint is checked against what the curated table records about the method (established from cited textbooks, papers and library documentation). satisfied/violated follow from those recorded facts; unknown means nothing is recorded for that constraint — check it yourself rather than assuming either way. A method restriction you did not state (e.g. acyclic must be true) is listed under assumes and makes the verdict conditional. Ranking: no violations first, then fewest assumptions, then methods your stated facts favour on speed (prefer_when, e.g. dense vs sparse), then the family\'s usual first choice, then fewer unknowns.',
    },
    DADS_LICENSE,
  );
}

// ───────────────────────── lookup ─────────────────────────

function resolveName(idx: Index, name: string): { method: Method | null; dads: DadsEntry | null; resolved_from: string; candidates: string[] } {
  const k = key(name);
  // A table id ("bellman-ford", "moore-hodgson") is the most precise handle; try it first.
  let method = idx.methodById.get(name.trim().toLowerCase()) ?? idx.methodByKey.get(k) ?? null;
  let dads = idx.dadsByKey.get(k) ?? null;
  if (!method && !dads) {
    // "Dijkstra" -> "Dijkstra's algorithm": prefix / containment on keys, shortest key wins.
    const mk = [...idx.methodByKey.keys()].filter((x) => x.startsWith(k) || x.includes(` ${k}`) || x.includes(`${k} `)).sort((a, b) => a.length - b.length);
    const dk = [...idx.dadsByKey.keys()].filter((x) => x.startsWith(k) || x.includes(` ${k}`) || x.includes(`${k} `)).sort((a, b) => a.length - b.length);
    if (mk.length) method = idx.methodByKey.get(mk[0]) ?? null;
    if (dk.length) dads = idx.dadsByKey.get(dk[0]) ?? null;
  }
  if (method && !dads) dads = idx.dadsByKey.get(key(method.name)) ?? method.aliases.map((a) => idx.dadsByKey.get(key(a))).find(Boolean) ?? null;
  if (dads && !method) method = idx.methodByKey.get(key(dads.name)) ?? dads.aliases.map((a) => idx.methodByKey.get(key(a))).find(Boolean) ?? null;
  const resolved_from = method?.name ?? dads?.name ?? '';
  let candidates: string[] = [];
  if (!method && !dads) {
    const q = new Set(tokens(name));
    candidates = [...idx.methods.map((m) => ({ n: m.name, s: hits(q, m.name + ' ' + m.aliases.join(' ')) })), ...idx.dads.map((e) => ({ n: e.name, s: hits(q, e.name + ' ' + e.aliases.join(' ')) }))]
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 8)
      .map((x) => x.n);
  }
  return { method, dads, resolved_from, candidates };
}

interface RosettaSection {
  index: string;
  line: string;
  level: string;
  anchor: string;
}

async function rosettaResolve(name: string): Promise<{ title: string; url: string } | null> {
  const u = new URL('https://rosettacode.org/w/api.php');
  u.searchParams.set('action', 'query');
  u.searchParams.set('list', 'search');
  u.searchParams.set('srsearch', name);
  u.searchParams.set('srnamespace', '0');
  u.searchParams.set('srlimit', '5');
  u.searchParams.set('format', 'json');
  const res = await afFetch(u, 'Rosetta Code');
  if (!res.ok) throw await httpError(res, 'Rosetta Code');
  const j = (await res.json()) as { query?: { search?: Array<{ title: string }> } };
  const hit = j.query?.search?.[0];
  if (!hit) return null;
  return { title: hit.title, url: `https://rosettacode.org/wiki/${encodeURIComponent(hit.title.replace(/ /g, '_'))}` };
}

async function rosettaSections(title: string): Promise<RosettaSection[]> {
  const u = new URL('https://rosettacode.org/w/api.php');
  u.searchParams.set('action', 'parse');
  u.searchParams.set('page', title);
  u.searchParams.set('prop', 'sections');
  u.searchParams.set('redirects', '1');
  u.searchParams.set('format', 'json');
  const res = await afFetch(u, 'Rosetta Code');
  if (!res.ok) throw await httpError(res, 'Rosetta Code');
  const j = (await res.json()) as { parse?: { sections?: RosettaSection[] } };
  return j.parse?.sections ?? [];
}

async function rosettaSectionCode(title: string, section: string): Promise<{ wikitext: string; code: Array<{ lang: string | null; code: string }> }> {
  const u = new URL('https://rosettacode.org/w/api.php');
  u.searchParams.set('action', 'parse');
  u.searchParams.set('page', title);
  u.searchParams.set('prop', 'wikitext');
  u.searchParams.set('section', section);
  u.searchParams.set('redirects', '1');
  u.searchParams.set('format', 'json');
  const res = await afFetch(u, 'Rosetta Code');
  if (!res.ok) throw await httpError(res, 'Rosetta Code');
  const j = (await res.json()) as { parse?: { wikitext?: { '*'?: string } } };
  const wikitext = j.parse?.wikitext?.['*'] ?? '';
  const code: Array<{ lang: string | null; code: string }> = [];
  for (const m of wikitext.matchAll(/<(?:syntaxhighlight|source)\s+lang="([^"]*)"[^>]*>([\s\S]*?)<\/(?:syntaxhighlight|source)>|<lang\s+([^>]*)>([\s\S]*?)<\/lang>/gi)) {
    code.push({ lang: m[1] ?? m[3] ?? null, code: (m[2] ?? m[4] ?? '').trim() });
  }
  return { wikitext, code };
}

async function cpaIntro(page: CpaPage): Promise<string | null> {
  const res = await afFetch(page.url, 'cp-algorithms');
  if (!res.ok) return null;
  const html = await res.text();
  const main = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1] ?? html;
  const paras = [...main.matchAll(/<p>([\s\S]*?)<\/p>/gi)].map((m) => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()).filter((p) => p.length > 40);
  return paras.length ? paras.slice(0, 2).join(' ').slice(0, 700) : null;
}

async function skienaPage(p: SkienaProblem): Promise<{ input: string | null; problem: string | null; implementations: Array<{ label: string; url: string }> } | null> {
  const res = await afFetch(p.url, 'Algorithm Repository');
  if (!res.ok) return null;
  const html = await res.text();
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const input = text.match(/Input Description:\s*(.*?)\s*Problem:/i)?.[1] ?? null;
  const problem = text.match(/Problem:\s*(.*?)\s*(?:Excerpt from|$)/i)?.[1]?.slice(0, 400) ?? null;
  const implementations: Array<{ label: string; url: string }> = [];
  for (const m of html.matchAll(/<a href="([^"]*implementations?\/[^"]+|https?:\/\/[^"]+)"[^>]*>([^<]{2,80})<\/a>/gi)) {
    const url = m[1].startsWith('http') ? m[1] : new URL(m[1], p.url).toString();
    if (/skiena|sunysb|amazon|googletagmanager/i.test(url)) continue;
    if (!implementations.some((x) => x.url === url)) implementations.push({ label: m[2].trim(), url });
  }
  return { input, problem, implementations: implementations.slice(0, 15) };
}

async function algorithmLookup(args: Record<string, unknown>): Promise<unknown> {
  const idx = ensureIndex(args);
  const name = String(args.name ?? '').trim();
  if (!name) throw new Error('name is required, e.g. "Dijkstra", "red-black tree", "Hopcroft-Karp"');
  const r = resolveName(idx, name);
  if (!r.method && !r.dads) {
    return attachLicense(
      {
        found: false,
        reason: 'no_match',
        name,
        data_as_of: idx.data_as_of,
        hint: r.candidates.length ? `No entry named "${name}". Closest names: ${r.candidates.join('; ')}. Call again with one of them.` : `No entry named "${name}" in the curated table or NIST DADS. Describe the problem instead with algorithm_find.`,
        candidates: r.candidates,
      },
      DADS_LICENSE,
    );
  }
  const m = r.method;
  const d = r.dads;
  const names = [r.resolved_from, ...(m?.aliases ?? []), ...(d?.aliases ?? [])];
  const cpa = cpaFor(idx, names);
  const skiena = skienaFor(idx, r.resolved_from, m ? [m.family] : []);
  const [ros, cpaText] = await Promise.allSettled([
    (async () => {
      const page = await rosettaResolve(r.resolved_from);
      if (!page) return null;
      const sections = await rosettaSections(page.title);
      const languages = sections.filter((s) => s.level === '2').map((s) => s.line);
      return { task: page.title, url: page.url, languages_count: languages.length, languages: languages.slice(0, 60) };
    })(),
    cpa.length ? cpaIntro(cpa[0]) : Promise.resolve(null),
  ]);
  const failed: string[] = [];
  if (ros.status === 'rejected') failed.push(`rosetta: ${String(ros.reason?.message ?? ros.reason)}`);
  if (cpaText.status === 'rejected') failed.push(`cp-algorithms: ${String(cpaText.reason?.message ?? cpaText.reason)}`);

  const body: Record<string, unknown> = {
    found: true,
    name: r.resolved_from,
    resolved_from: key(name) !== key(r.resolved_from) ? name : undefined,
    data_as_of: idx.data_as_of,
    kind: m?.kind ?? d?.type,
    family: m?.family,
    curated: m
      ? {
          tier: m.tier,
          solves: m.solves,
          preconditions: m.preconditions,
          constraints: m.constraints,
          guarantee: m.guarantee,
          bounds: boundsView(m.bounds),
          when_to_use: m.when_to_use,
          when_not: m.when_not,
          alternatives: m.alternatives.map((id) => idx.methodById.get(id)?.name ?? id),
          phrasings: m.phrasings,
          citations: m.citations.map((c) => citeText(c)),
          note: 'Facts established from the cited textbook pages, papers and library documentation, stated in our own words; CLRS4 = Cormen, Leiserson, Rivest & Stein, Introduction to Algorithms 4th ed.; Erciyes2026 = Erciyes, Guide to Graph Algorithms 2nd ed.; Grokking2024 = Bhargava, Grokking Algorithms; ATLB = Christian & Griffiths, Algorithms to Live By.',
        }
      : undefined,
    dads: d ? dadsView(d) : undefined,
    cp_algorithms: cpa.length
      ? { title: cpa[0].title, url: cpa[0].url, tags: cpa[0].tags, intro: cpaText.status === 'fulfilled' ? cpaText.value : undefined, license: CPA_LICENSE.id, attribution: CPA_LICENSE.attribution }
      : undefined,
    problem_pages: skiena.length ? skiena.map((p) => ({ problem: p.name, category: p.category, url: p.url, source: SKIENA_SOURCE })) : undefined,
    rosetta_code: ros.status === 'fulfilled' && ros.value ? { ...ros.value, license: ROSETTA_LICENSE.id, attribution: ROSETTA_LICENSE.attribution, hint: 'Call algorithm_implementations with a language for the code.' } : undefined,
    partial: failed.length ? true : undefined,
    failed_sources: failed.length ? failed : undefined,
  };
  return attachLicense(body, DADS_LICENSE);
}

// ───────────────────────── implementations ─────────────────────────

async function algorithmImplementations(args: Record<string, unknown>): Promise<unknown> {
  const idx = ensureIndex(args);
  const name = String(args.name ?? '').trim();
  if (!name) throw new Error('name is required, e.g. "Dijkstra\'s algorithm"');
  const language = args.language ? String(args.language).trim() : null;
  const r = resolveName(idx, name);
  const canonical = r.resolved_from || name;
  const page = await rosettaResolve(canonical);
  const dadsLinks = r.dads?.implementations ?? [];
  const cpa = cpaFor(idx, [canonical, ...(r.method?.aliases ?? []), ...(r.dads?.aliases ?? [])]);
  const skiena = skienaFor(idx, canonical, r.method ? [r.method.family] : []);
  const skienaDetail = skiena.length ? await skienaPage(skiena[0]).catch(() => null) : null;

  if (!page) {
    const anyLinks = dadsLinks.length || cpa.length || (skienaDetail?.implementations.length ?? 0);
    return attachLicense(
      {
        found: anyLinks > 0,
        reason: anyLinks ? undefined : 'no_match',
        name: canonical,
        data_as_of: idx.data_as_of,
        rosetta_code: null,
        hint: `Rosetta Code has no task page matching "${canonical}".${anyLinks ? ' Other implementation links are listed below.' : ' Try the method\'s most common English name, or algorithm_lookup to see what it is called.'}`,
        reference_links: dadsLinks.length ? dadsLinks.map((l) => ({ ...l, grade: 'reference', source: 'NIST DADS' })) : undefined,
        cp_algorithms: cpa.length ? cpa.map((p) => ({ title: p.title, url: p.url, grade: 'educational', license: CPA_LICENSE.id })) : undefined,
        problem_page: skienaDetail && skiena.length ? { problem: skiena[0].name, url: skiena[0].url, implementations: skienaDetail.implementations, source: SKIENA_SOURCE } : undefined,
      },
      ROSETTA_LICENSE,
    );
  }
  const sections = await rosettaSections(page.title);
  const langSections = sections.filter((s) => s.level === '2');
  if (!langSections.length) throw new Error(`Rosetta Code page "${page.title}" parsed with no language sections — page layout changed, not an absence of implementations`);

  if (!language) {
    return attachLicense(
      {
        found: true,
        name: canonical,
        data_as_of: idx.data_as_of,
        rosetta_code: {
          task: page.title,
          url: page.url,
          languages_count: langSections.length,
          languages: langSections.map((s) => s.line),
          grade: 'educational',
          note: 'Rosetta Code solutions are contributed illustrations of the task, not maintained libraries. Call again with `language` for one solution\'s code.',
        },
        reference_links: dadsLinks.length ? dadsLinks.map((l) => ({ ...l, grade: 'reference', source: 'NIST DADS' })) : undefined,
        cp_algorithms: cpa.length ? cpa.map((p) => ({ title: p.title, url: p.url, grade: 'educational', license: CPA_LICENSE.id })) : undefined,
        problem_page: skienaDetail && skiena.length ? { problem: skiena[0].name, url: skiena[0].url, implementations: skienaDetail.implementations, source: SKIENA_SOURCE } : undefined,
      },
      ROSETTA_LICENSE,
    );
  }
  const lk = key(language);
  const sec = langSections.find((s) => key(s.line) === lk) ?? langSections.find((s) => key(s.line).startsWith(lk) || lk.startsWith(key(s.line)));
  if (!sec) {
    return attachLicense(
      {
        found: false,
        reason: 'language_not_present',
        name: canonical,
        language,
        data_as_of: idx.data_as_of,
        hint: `Rosetta Code's "${page.title}" page has no ${language} solution. Languages present: ${langSections.map((s) => s.line).join(', ')}.`,
        rosetta_code: { task: page.title, url: page.url, languages: langSections.map((s) => s.line) },
      },
      ROSETTA_LICENSE,
    );
  }
  // A language section may hold several sub-solutions (level-3 headings); gather the code from the level-2 section
  // and every level-3 under it, in order.
  const secIdx = sections.findIndex((s) => s.index === sec.index);
  const children = sections.slice(secIdx + 1).filter((s, i, arr) => {
    const upto = arr.findIndex((x) => x.level === '2');
    return s.level !== '2' && (upto === -1 || i < upto);
  });
  const parts = await Promise.all([sec, ...children].map((s) => rosettaSectionCode(page.title, s.index)));
  const code = parts.flatMap((p, i) => p.code.map((c) => ({ ...c, variant: i === 0 ? sec.line : children[i - 1].line })));
  if (!code.length) {
    throw new Error(`Rosetta Code "${page.title}" ${sec.line} section returned no code blocks — markup changed (expected <syntaxhighlight>), not an absence of code`);
  }
  return attachLicense(
    {
      found: true,
      name: canonical,
      language: sec.line,
      data_as_of: idx.data_as_of,
      source_url: `${page.url}#${encodeURIComponent(sec.anchor)}`,
      grade: 'educational',
      solutions: code,
      note: 'Contributed illustration of the task under CC BY-SA 4.0: credit Rosetta Code and keep the licence if you publish a derivative. Test before relying on it.',
    },
    ROSETTA_LICENSE,
  );
}

// ───────────────────────── tool defs ─────────────────────────

const tools: McpToolExport['tools'] = [
  {
    name: 'algorithm_find',
    description:
      'Which algorithm, data structure or technique fits a computational problem. Describe the problem in words ("shortest route between two points with positive costs", "assign workers to jobs minimising cost", "find near-duplicate records", "schedule jobs to minimise lateness") and get the standard textbook methods (preconditions, worst-case / expected / amortized bounds, when to use and when not, alternatives, each fact cited to CLRS and other textbooks and to the NIST Dictionary of Algorithms and Data Structures), the open questions whose answers decide between them, Skiena Algorithm Repository problem pages, and recent research papers with dates from Hugging Face Papers and arXiv. want=common for textbook only, novel for recent papers only.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        problem: { type: 'string', description: 'The computational problem in plain words, e.g. "all-pairs shortest paths", "approximate nearest neighbor search in high dimensions", "longest common subsequence of two strings".' },
        want: { type: 'string', enum: ['common', 'novel', 'both'], description: 'common = textbook methods; novel = recent research papers; both (default).' },
        since_year: { type: 'number', description: 'Earliest publication year for novel results (default: five years ago).' },
        limit: { type: 'number', description: 'Max results per leg (1-25, default 8).' },
        constraints: { type: 'object', description: 'Optional facts about your instance (same keys as algorithm_compare, e.g. {"negative_weights": true}); textbook results that violate one move to the end and each result carries a per-constraint fit.' },
      },
      required: ['problem'],
    },
  },
  {
    name: 'algorithm_compare',
    description:
      'Compare candidate algorithms against the facts of YOUR instance and get a verdict. Pass method names (e.g. ["dijkstra","bellman-ford"]) or a problem description, plus constraints such as {"negative_weights": true, "query": "single_source"}, {"stable": true, "key_type": "integer_small_range"}, {"exact": false, "dimensions": "high"}, {"false_positives_ok": true, "dynamic": "fully_dynamic"}. Each candidate gets satisfied / violated / unknown per constraint, read from a curated table cited to textbooks, papers and library docs; unknown means the table records nothing and is never guessed. Returns the winner (or "conditional" with the unknowns named, or "none_compatible"), each candidate\'s bounds and when-not advice, and the decisive questions you have not answered that would change the choice.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        names: { type: 'array', items: { type: 'string' }, description: 'Method names or aliases to compare (2-10), e.g. ["dijkstra", "bellman-ford", "johnson"].' },
        problem: { type: 'string', description: 'Instead of names: a problem description; the top curated candidates for it are compared.' },
        constraints: {
          type: 'object',
          description:
            'Facts about your instance. Keys: negative_weights, negative_cycles, weighted, directed, acyclic, bipartite (booleans); graph_density sparse|dense; query single_pair|single_source|all_pairs; exact, worst_case_guarantee, deterministic, false_positives_ok, online, streaming, in_memory, stable, sorted_input, ordered_queries, approximate_match, parallel, distributed, integer_capacities, preemption, precedence, recall, known_distribution, heuristic_available, continuous_variables, linear, convex, differentiable (booleans); dynamic static|insert_only|fully_dynamic; memory tight|normal; key_type integer_small_range|integer|comparable|string|vector; dimensions low|high; metric euclidean|cosine_or_inner_product|jaccard|hamming|edit_distance|general_metric; pattern_count one|many; scale small|medium|large|huge; machines single|multiple; objective max_lateness|num_late_jobs|total_completion_time|makespan|feasibility|total_cost|max_matching_size|fairness.',
        },
      },
      required: [],
    },
  },
  {
    name: 'algorithm_lookup',
    description:
      'One named algorithm, data structure or technique in full: what it solves, preconditions, complexity bounds with their kind (worst-case / expected / amortized) and textbook citations, when to use it and what to use instead, the NIST DADS dictionary entry (definition, relations, implementation links), the cp-algorithms article, Skiena Algorithm Repository problem pages, and which languages Rosetta Code has solutions in. Accepts short names ("Dijkstra", "KMP", "union-find") and aliases.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Method name or alias, e.g. "Dijkstra", "Floyd-Warshall", "red-black tree", "Hopcroft-Karp", "LRU".' },
      },
      required: ['name'],
    },
  },
  {
    name: 'algorithm_implementations',
    description:
      'Implementations of a named algorithm: the languages Rosetta Code has solutions in and, with language set, the source code of that solution (CC BY-SA 4.0, labelled educational), plus reference implementation links from the NIST DADS entry, the cp-algorithms article, and the Skiena Algorithm Repository implementation links for the problem.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Algorithm name, e.g. "Dijkstra\'s algorithm", "Floyd-Warshall algorithm", "Knuth-Morris-Pratt".' },
        language: { type: 'string', description: 'Programming language as Rosetta Code names it, e.g. "Python", "C++", "Go", "Rust", "Java". Omit to list the languages available.' },
      },
      required: ['name'],
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'algorithm_find':
      return algorithmFind(args);
    case 'algorithm_compare':
      return algorithmCompare(args);
    case 'algorithm_lookup':
      return algorithmLookup(args);
    case 'algorithm_implementations':
      return algorithmImplementations(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
