// The campaign's chapters and acts, in playing order. A chapter is a heading on
// the campaign screen; an act is one authored mission the pilot plays from start
// to finish. Adding an act later is one record here plus its mission file — the
// campaign screen, the unlock order and the restart rules all read this list.
//
//   id      stable id, used by saves and by the campaign screen
//   n       the name the pilot sees
//   d       one spoiler-safe line about the act
//   mission the campaign mission id (src/data/campaign/m01.js)
//
// An act is available when every earlier act is finished, or when it is the one
// currently in progress. There is no "offered at a station" rule in campaign
// mode: the chapter menu is where an act starts.

export const CAMPAIGN_CHAPTERS = Object.freeze([
  Object.freeze({
    id: "chapter-1",
    n: "Chapter 1: Auric Reach",
    d: "Flight school, a captain who expects better, and the first people who want you dead.",
    acts: Object.freeze([
      Object.freeze({
        id: "act-1",
        n: "Act 1: First Sortie",
        d: "Graduate, learn the Wasp, and survive your first real contact.",
        mission: "campaign.m01-first-sortie",
      }),
    ]),
  }),
]);

/** Every act, flattened in playing order, each carrying its chapter. */
export const CAMPAIGN_ACTS = Object.freeze(
  CAMPAIGN_CHAPTERS.flatMap(chapter =>
    chapter.acts.map(act => Object.freeze({ ...act, chapterId: chapter.id, chapterName: chapter.n })),
  ),
);
