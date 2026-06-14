// Data-source attribution. UCDP GED is CC BY 4.0, which REQUIRES visible
// attribution and citation of the listed publications — this satisfies that
// licence term for commercial use. Kept subtle (bottom-left, monospace) to fit
// the gold-on-charcoal identity without competing with the globe.
const UCDP_CITATION =
  'UCDP Georeferenced Event Dataset (CC BY 4.0). Davies, Pettersson & Öberg, ' +
  '“Organized violence 1989–2025”, Journal of Peace Research, 2026; ' +
  'Sundberg & Melander (2013). UCDP is part of DEMSCORE (Swedish Research ' +
  'Council grant 2021-00162).'

export default function Attribution() {
  return (
    <div
      className="fixed bottom-1 left-2 z-50 text-[10px] leading-none select-none pointer-events-auto"
      style={{ color: 'var(--text-3)' }}
    >
      <span title={UCDP_CITATION}>
        Data:{' '}
        <a
          href="https://www.gdeltproject.org/"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--text-3)' }}
        >
          GDELT
        </a>
        {' · '}
        <a
          href="https://ucdp.uu.se/"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--text-3)' }}
          title={UCDP_CITATION}
        >
          UCDP
        </a>{' '}
        <span style={{ color: 'var(--text-3)' }}>(CC BY 4.0)</span>
      </span>
    </div>
  )
}
