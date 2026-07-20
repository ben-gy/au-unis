// Domain jargon, explained for someone who has never read a higher education
// statistics release. Assume the reader knows nothing — most visitors are a
// year-12 student or a parent, not a policy analyst.

export interface Term {
  term: string;
  definition: string;
}

export const GLOSSARY: Record<string, Term> = {
  attrition: {
    term: 'Attrition rate',
    definition:
      'The share of students who started a bachelor degree in one year and were not studying at all the next year. Lower is better. It measures leaving in the FIRST year, which is when most people who leave, leave.',
  },
  'sector-attrition': {
    term: 'Sector attrition rate',
    definition:
      'Attrition counted across the whole higher education sector: a student who transfers to a different university is still studying, so they are NOT counted as having dropped out. This is the fairer measure of a university, and it is the one used for domestic students.',
  },
  'provider-attrition': {
    term: 'Provider attrition rate',
    definition:
      'Attrition counted at one institution only: a student who transfers to a different university IS counted as lost. It is always higher than the sector rate. Overseas attrition can only be measured this way, so overseas and domestic attrition are not directly comparable.',
  },
  retention: {
    term: 'Retention rate',
    definition:
      'The share of students who started a bachelor degree and were still studying the following year. Broadly the mirror image of attrition — higher is better.',
  },
  success: {
    term: 'Success rate',
    definition:
      'The share of subjects students actually passed, measured by study load rather than headcount. A success rate of 88% means students passed 88% of what they enrolled in. It says how hard the year went for the people who stayed.',
  },
  completion: {
    term: 'Completion rate',
    definition:
      'The share of a starting group (a "cohort") who had finished a bachelor degree within a set number of years. Because degrees vary in length, the same cohort looks very different at four, six and nine years.',
  },
  'still-enrolled': {
    term: 'Still enrolled',
    definition:
      'Students from the starting group who have not finished yet but are still studying. This is NOT a failure — many degrees run longer than four years, and part-time students take longer still. Counting "still enrolled" as a drop-out is the most common mistake made with this data.',
  },
  eftsl: {
    term: 'EFTSL',
    definition:
      'Equivalent Full-Time Student Load. One EFTSL is one student studying a full year full-time. Two half-time students are one EFTSL. It measures teaching volume rather than headcount.',
  },
  'student-staff-ratio': {
    term: 'Student-staff ratio',
    definition:
      'Student load (EFTSL) divided by academic staff (FTE) — roughly how many full-time-equivalent students share one full-time-equivalent academic. Lower usually means more contact with teaching staff. The figure includes casual academics, so it flatters institutions that rely heavily on casual tutors.',
  },
  atar: {
    term: 'ATAR',
    definition:
      'Australian Tertiary Admission Rank — a percentile ranking from 0 to 99.95 given to school leavers, used by universities to decide admission. An ATAR of 80 means you finished ahead of roughly 80% of your year group.',
  },
  ses: {
    term: 'Socio-economic status (SES)',
    definition:
      'A measure based on the ABS index for the area a student lives in, not their family income. The bottom 25% of areas are "low SES", the top 25% "high SES". It describes a neighbourhood, so it is a rough proxy for an individual.',
  },
  'overseas-student': {
    term: 'Overseas student',
    definition:
      'A student who is not an Australian citizen, New Zealand citizen, permanent resident or permanent humanitarian visa holder. Most study in Australia on a student visa; some study offshore at an Australian institution’s overseas campus or by distance.',
  },
  'domestic-student': {
    term: 'Domestic student',
    definition:
      'An Australian citizen, New Zealand citizen, Australian permanent resident, or permanent humanitarian visa holder. Domestic students can usually access a Commonwealth supported place and HECS-HELP.',
  },
  'table-a': {
    term: 'Table A and Table B providers',
    definition:
      'Categories in the Higher Education Support Act. Table A providers are the 37 public universities; Table B are a handful of private universities. Both can offer Commonwealth supported places, which is why they are reported together.',
  },
  nuhei: {
    term: 'Non-university higher education institutions',
    definition:
      'Colleges and private providers that award degrees but are not universities. The department reports them as one combined bucket per state rather than individually, so they are excluded from institution rankings here.',
  },
  'commencing-student': {
    term: 'Commencing student',
    definition:
      'A student who enrolled in a particular course at a particular institution for the first time during the year. Attrition and completion are always measured on commencing students.',
  },
  'field-of-education': {
    term: 'Broad field of education',
    definition:
      'The subject area of a course, using the Australian Standard Classification of Education — twelve broad groups such as Health, Society and Culture, or Engineering.',
  },
  suppressed: {
    term: 'Not published',
    definition:
      'The department withholds cells that are too small to publish without identifying individuals, marked "np" or "< 5". A withheld cell is not zero — the real value is small but non-zero, so it is shown here as "not published" rather than counted as nothing.',
  },
};

let popover: HTMLDivElement | null = null;

function ensurePopover(): HTMLDivElement {
  if (!popover) {
    popover = document.createElement('div');
    popover.className = 'glossary-pop';
    popover.setAttribute('role', 'dialog');
    document.body.appendChild(popover);
  }
  return popover;
}

function close(): void {
  popover?.classList.remove('open');
}

/** Render an inline term with a click-to-explain affordance. */
export function glossaryTerm(key: string, label?: string): string {
  const entry = GLOSSARY[key];
  if (!entry) return label ?? key;
  return `<span class="glossary-link" data-term="${key}" role="button" tabindex="0">${label ?? entry.term}</span>`;
}

export function initGlossary(): void {
  const open = (target: HTMLElement) => {
    const key = target.getAttribute('data-term');
    const entry = key ? GLOSSARY[key] : undefined;
    if (!entry) return;
    const el = ensurePopover();
    el.innerHTML = '';
    const h = document.createElement('h4');
    h.textContent = entry.term;
    const p = document.createElement('p');
    p.textContent = entry.definition;
    el.append(h, p);
    el.classList.add('open');

    const rect = target.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    let left = rect.left;
    let top = rect.bottom + 8;
    if (left + box.width + 12 > window.innerWidth) left = window.innerWidth - box.width - 12;
    if (top + box.height + 12 > window.innerHeight) top = rect.top - box.height - 8;
    el.style.left = `${Math.max(12, left)}px`;
    el.style.top = `${Math.max(12, top)}px`;
  };

  document.addEventListener('click', (e) => {
    const target = (e.target as Element).closest<HTMLElement>('[data-term]');
    if (target) {
      e.stopPropagation();
      open(target);
      return;
    }
    if (!(e.target as Element).closest('.glossary-pop')) close();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    if ((e.key === 'Enter' || e.key === ' ') && (e.target as Element)?.matches?.('[data-term]')) {
      e.preventDefault();
      open(e.target as HTMLElement);
    }
  });

  window.addEventListener('scroll', close, true);
  window.addEventListener('resize', close);
}
