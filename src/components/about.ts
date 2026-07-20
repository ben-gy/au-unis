// About modal — what this is, where the numbers come from, and the four
// specific ways this dataset will mislead you if you read it quickly.
import type { Dataset } from '../data';
import { escapeHtml, formatNumber } from '../format';
import { glossaryTerm } from '../glossary';

let modal: HTMLElement | null = null;
let overlay: HTMLElement | null = null;
let lastFocused: Element | null = null;

export function closeAbout(): void {
  modal?.classList.remove('open');
  overlay?.classList.remove('open');
  if (lastFocused instanceof HTMLElement) lastFocused.focus();
}

export function openAbout(data: Dataset): void {
  lastFocused = document.activeElement;

  if (!modal || !overlay) {
    overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.addEventListener('click', closeAbout);

    modal = document.createElement('div');
    modal.className = 'modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'About this site');

    document.body.append(overlay, modal);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal?.classList.contains('open')) closeAbout();
    });
  }

  // The pipeline names files by section number; readers need the titles.
  const SOURCE_TITLES: Record<string, string> = {
    'section2.xlsx': 'Section 2 — All students (enrolments by level, field, gender and citizenship)',
    'section7.xlsx': 'Section 7 — Overseas students',
    'section14.xlsx': 'Section 14 — Award course completions',
    'section15.xlsx': 'Section 15 — Attrition, success and retention',
    'section17.xlsx': 'Section 17 — Completion rates by cohort',
    'timeseries.xlsx': 'Student summary time series',
    'staff-ratios.xlsx': 'Staff Appendix 2 — Student-staff ratios',
  };

  const sources = data.meta.sources
    .map(
      (s) =>
        `<li><a href="${escapeHtml(s.source)}" target="_blank" rel="noopener">${escapeHtml(
          SOURCE_TITLES[s.filename] ?? s.filename.replace('.xlsx', '')
        )}</a> <span style="opacity:.7">(${s.year} release)</span></li>`
    )
    .join('');

  modal.innerHTML = `
    <button class="modal-close" type="button" aria-label="Close">×</button>
    <h2>About this site</h2>
    <p>Every Australian university, compared on the measures that actually matter when you are choosing one — how many students it has, how many are international, how many drop out, how many finish, and how many students share each academic.</p>

    <h3>Where the data comes from</h3>
    <p>All of it is published by the Australian Government Department of Education, in the annual <em>Selected Higher Education Statistics</em> collections. Student data covers ${escapeHtml(
      String(data.national.studentYear)
    )}; staff data covers ${escapeHtml(String(data.national.staffYear))}. Nothing here is modelled or estimated — every figure is the department's, joined together and given a usable interface.</p>
    <ul>${sources}</ul>
    <p>The site rebuilds itself once a year, shortly after the September student data release.</p>

    <h3>What counts as a “university” here</h3>
    <p>The ${data.institutions.length} institutions the department reports individually — the public universities plus a handful of private ones. It also publishes a combined bucket per state for ${glossaryTerm(
      'nuhei',
      'non-university higher education institutions'
    )}: ${formatNumber(
      data.national.nuheiStudents
    )} students across many small colleges. Because that bucket is not one institution, it is excluded from every ranking, which is why the institution totals here (${formatNumber(
      data.national.institutionStudents
    )}) sum to less than the national total (${formatNumber(data.national.totalStudents)}).</p>

    <h3>Four ways this data will mislead you</h3>
    <ul>
      <li><strong>The four-year completion rate is not the failure rate.</strong> About 40% of domestic students have finished a bachelor degree four years after starting — but around a third are ${glossaryTerm(
        'still-enrolled',
        'still enrolled'
      )}, because plenty of degrees take longer than four years and part-time students longer again. Given nine years, roughly three-quarters have completed. The “Who finishes” view defaults to nine years for this reason.</li>
      <li><strong>Domestic and overseas drop-out rates are different measures.</strong> The domestic figure is ${glossaryTerm(
        'sector-attrition',
        'sector attrition'
      )} — transferring to another university does not count as dropping out. The overseas figure is ${glossaryTerm(
        'provider-attrition',
        'provider attrition'
      )} — a transfer does count. The overseas number is structurally higher, and putting the two side by side would be comparing different things. This site never does.</li>
      <li><strong>“Not published” is not zero.</strong> The department withholds cells too small to publish without identifying individuals, marking them <code>np</code> or <code>&lt; 5</code>. Those are shown here as “${escapeHtml(
        'not published'
      )}” and excluded from totals — never counted as nothing.</li>
      <li><strong>A zero in a historic series usually means “not reporting yet”.</strong> Several institutions only entered the collection part-way through the decade. Their early years read as literal zeros in the source, which would make them the best-performing universities in the country. Those are treated as missing.</li>
    </ul>

    <h3>Caveats worth knowing</h3>
    <ul>
      <li>${glossaryTerm(
        'student-staff-ratio',
        'Student-staff ratios'
      )} include casual academics, so they flatter institutions that lean heavily on casual tutors.</li>
      <li>Attrition, retention and completion are measured on commencing <em>bachelor</em> students only — they say nothing about postgraduate study.</li>
      <li>${glossaryTerm(
        'ses',
        'Socio-economic status'
      )} is based on the area a student lives in, not their family's income, so it is a rough proxy for any individual.</li>
      <li>Some institutions carry data-quality notes from the department; where they exist they appear on that university's profile.</li>
    </ul>

    <h3>How to use it</h3>
    <p>Click any university anywhere on the site — a bar, a dot, a row, a cell — for its full profile. Terms with a dotted underline and an ⓘ can be clicked for a plain-English definition. Views are linkable, so you can share exactly what you are looking at.</p>`;

  modal.querySelector<HTMLButtonElement>('.modal-close')!.addEventListener('click', closeAbout);
  modal.classList.add('open');
  overlay.classList.add('open');
  modal.querySelector<HTMLButtonElement>('.modal-close')!.focus();
  modal.scrollTop = 0;
}
