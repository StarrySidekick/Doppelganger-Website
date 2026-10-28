# StarrySidekick and DigiDesk

Two things in one repository:

- **[`digidesk/`](digidesk/)**: the tool. A website builder where everything
  sits on a grid, Bureau's object model for the web, as an Astro integration.
- **[`site/`](site/)**: the project built with it. A self-hosted rebuild of
  timothyvlangas.com (StarrySidekick.com).

```bash
npm install
npm run dev    # the site, with the tool linked in
npm test       # both
```

Live at https://starrysidekick.github.io/Doppelganger-Website/ . See
[`CLAUDE.md`](CLAUDE.md) for how the two are wired and how to work on each.

**The website is what is being built right now; the tool is parked.** See
[`INTENT.md`](INTENT.md).
