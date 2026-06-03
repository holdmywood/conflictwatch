import { describe, it, expect, vi } from 'vitest'

const { extractTsvUrls } = await import('./gdelt.js')

const SAMPLE_LASTUPDATE = `\
20240601120000.export.CSV.zip http://data.gdeltproject.org/gdeltv2/20240601120000.export.CSV.zip
20240601120000.mentions.CSV.zip http://data.gdeltproject.org/gdeltv2/20240601120000.mentions.CSV.zip
20240601120000.gkg.csv.zip http://data.gdeltproject.org/gdeltv2/20240601120000.gkg.csv.zip`

describe('extractTsvUrls', () => {
  it('extracts the events (export) URL', () => {
    const { eventsUrl } = extractTsvUrls(SAMPLE_LASTUPDATE)
    expect(eventsUrl).toBe('http://data.gdeltproject.org/gdeltv2/20240601120000.export.CSV.zip')
  })

  it('extracts the mentions URL', () => {
    const { mentionsUrl } = extractTsvUrls(SAMPLE_LASTUPDATE)
    expect(mentionsUrl).toBe('http://data.gdeltproject.org/gdeltv2/20240601120000.mentions.CSV.zip')
  })

  it('throws when index format is unexpected', () => {
    expect(() => extractTsvUrls('garbage input')).toThrow()
  })
})
