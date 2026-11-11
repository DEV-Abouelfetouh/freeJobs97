# Princanoo — One-Page Coffee Shop Website

A simple, fast, single-page website for **Princanoo** coffee shop.
No build tools, no dependencies — just one `index.html` file.

## Features
- Fully responsive (mobile, tablet, desktop)
- Bilingual **English / Arabic** with one-click language switcher and proper RTL layout
- WhatsApp click-to-chat (pre-filled message) — floating button + hero & contact buttons
- Email contact button (`mailto:`)
- Sticky header, smooth scrolling, SEO meta tags
- Language preference remembered via `localStorage`

## Files
| File | Purpose |
|------|---------|
| `index.html` | The entire website (HTML + CSS + JS inlined) |
| `README.md` | This guide |

## Preview locally
Open `index.html` in any browser. No server needed.

## Customize

### 1. WhatsApp number, email & message (most important)
At the bottom of `index.html`, inside the `<script>` tag:

```js
const WA_NUMBER = "201234567890"; // country code + number, no "+" or spaces
const EMAIL = "hello@princanoo.com";
const WA_MESSAGE = "Hello Princanoo! I'd like to place an order.";
