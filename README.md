# Yoga Sequence Engine

A minimalist yoga sequencing app built on a relational PostgreSQL database. The UI strips away standard fitness app clutter to focus on a low-cognitive-load experience, while the backend handles the complex relational mapping of Iyengar yoga variations.

## Live Preview
[https://markopie-yoga-app-ev-cgmd.bolt.host](https://markopie-yoga-app-ev-cgmd.bolt.host)

*Note: Anonymous 'Guest' Auth is enabled. Reviewers can bypass Google OAuth and test the data engine immediately.*

---

## Core Features

* **Asana Library (Browse):** A searchable, typography-focused database of primary anatomical poses.
* **Sequence Engine:** Parses shorthand input into precise database queries, automatically mapping base poses to their specific variations behind the scenes.
* **Focus Mode:** The core playback loop. A minimal UI designed for actual practice, stripped of unnecessary controls.

---

## Technical Architecture

Built for performance and maintainability, avoiding heavy frameworks where vanilla solutions are more efficient:

* **Relational Database (Supabase / PostgreSQL):** Uses a strict parent/child schema (`asanas` and `stages`) to manage the complexity of the Iyengar method, avoiding the brittleness of flat-file data structures.
* **Vanilla JS (ES6):** Built entirely in Vanilla JavaScript. Relies on pure DOM manipulation and explicit module scoping for a lightweight footprint.
* **Build System:** Bundled with Vite for clean static asset delivery.

---

## Security & Data Integrity

* **Row Level Security (RLS):** Database tables are locked down. Anonymous/Guest users have `SELECT`-only access to the public library. All write operations are blocked at the PostgreSQL level.
* **Input Sanitization:** The custom `dataAdapter.js` uses strict regex boundaries to parse user inputs (handling edge cases like concatenated Roman numerals) before querying, preventing database errors and "ghost poses."

---

## Reviewer Test Path

1. Open the Live Preview link.
2. Click **Browse** to verify the data library load.
3. Open a **Sequence**.
4. Press **Start** to enter **Focus Mode** and test the playback loop.