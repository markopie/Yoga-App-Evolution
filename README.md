# Yoga Sequence Engine v1.1

A professional-grade yoga sequencing app built on a relational PostgreSQL database. Designed for high-performance practice, the UI prioritizes a low-cognitive-load "Focus Mode," while the backend manages the complex relational mapping of the Iyengar yoga method.

## 🚀 Live System
[https://markopie-yoga-app-ev-cgmd.bolt.host](https://markopie-yoga-app-ev-cgmd.bolt.host)

*Note: Anonymous 'Guest' Auth is enabled for immediate testing of the data engine.*

---

## 🏗️ Technical Architecture (The "Single Brain" Pattern)

The application utilizes a **Centralized Controller** architecture to ensure UI consistency and data integrity across all practice modes.

* **Database (Supabase / PostgreSQL):** Leverages a strict parent/child schema (`asanas` ↔ `stages`) to handle complex variations.
* **Centralized Logic (`sequenceUtils.js`):** All timing calculations, bilateral pose doubling, and tier overrides are quarantined here. This prevents "UI Drift" and ensures the Dashboard, Sequence Builder, and Timer always show the same values.
* **State Proxying (`globalState`):** Uses ES6 Proxies to bridge the gap between modular services and the legacy UI, allowing for a lightweight, framework-free reactivity.
* **Expansion Engine:** A custom recursive parser that unrolls Macros and Loops into a flat playback list before practice begins.

---

## 🛠️ Developer Workflow & Maintenance

To maintain the project's $70\%$ reduction in code bloat achieved in v1.1, follow these standards:

1.  **Timing & Math:** Never perform math ($* 2$ or $/ 2$) inside a UI file. Always call `getEffectiveTime()` from the central utility.
2.  **Logic Separation:** * `app.js` = The "Orchestrator" (Initializes and Routes).
    * `src/services/` = Data fetching and logic processing.
    * `src/ui/` = Rendering and DOM listeners only.
3.  **Auditing:** Run `python audit_timing_logic.py` before pushing to ensure no "Shadow Logic" has been introduced.

---

## 🔒 Security & Data Integrity

* **Row Level Security (RLS):** Production-grade PostgreSQL policies. Guests have `SELECT`-only access; write operations require authenticated Admin status.
* **Idempotent Data Adapter:** Normalizes inconsistent database strings into predictable objects immediately upon fetch to prevent runtime crashes.