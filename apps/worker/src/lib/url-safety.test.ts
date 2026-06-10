import { describe, it, expect } from 'vitest'
import { isSafeWebhookUrl } from './url-safety.js'

describe('isSafeWebhookUrl', () => {
  it('accepts a normal https webhook', () => {
    expect(isSafeWebhookUrl('https://hooks.slack.com/services/T0/B0/xyz')).toBe(true)
  })

  it('rejects plain http', () => {
    expect(isSafeWebhookUrl('http://example.com/hook')).toBe(false)
  })

  it('rejects localhost and loopback', () => {
    expect(isSafeWebhookUrl('https://localhost/hook')).toBe(false)
    expect(isSafeWebhookUrl('https://127.0.0.1/hook')).toBe(false)
    expect(isSafeWebhookUrl('https://[::1]/hook')).toBe(false)
  })

  it('rejects private and link-local IP ranges', () => {
    expect(isSafeWebhookUrl('https://10.0.0.5/hook')).toBe(false)
    expect(isSafeWebhookUrl('https://192.168.1.1/hook')).toBe(false)
    expect(isSafeWebhookUrl('https://172.16.0.1/hook')).toBe(false)
    expect(isSafeWebhookUrl('https://172.31.255.255/hook')).toBe(false)
    expect(isSafeWebhookUrl('https://169.254.169.254/latest/meta-data')).toBe(false)
  })

  it('accepts public IP ranges that merely resemble private ones', () => {
    expect(isSafeWebhookUrl('https://172.32.0.1/hook')).toBe(true)
    expect(isSafeWebhookUrl('https://11.0.0.1/hook')).toBe(true)
  })

  it('rejects .internal and .local hostnames', () => {
    expect(isSafeWebhookUrl('https://metadata.google.internal/computeMetadata')).toBe(false)
    expect(isSafeWebhookUrl('https://printer.local/hook')).toBe(false)
  })

  it('rejects unparseable URLs', () => {
    expect(isSafeWebhookUrl('not a url')).toBe(false)
    expect(isSafeWebhookUrl('')).toBe(false)
  })
})
