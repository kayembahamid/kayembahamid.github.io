# kayembahamid.github.io

Personal site for **Kayemba Hamiidu** — Security Engineer / Red Team & Penetration Testing.

Live at: https://kayembahamid.github.io

## Stack

Plain HTML/CSS/JS, no build step — deploys directly on GitHub Pages.

- `index.html` — page structure & content
- `assets/css/style.css` — dark neumorphism design system
- `assets/js/app.js` — typing hero, particle background, live GitHub repo feed
- `assets/Kayemba_Hamiidu_Security_Engineer_Resume.pdf` — downloadable résumé

## Design

Visual language recreates the dark-neumorphism aesthetic of the
[Neumorphism Jekyll theme](https://github.com/longpdo/neumorphism) by Long Do (MIT licensed) —
soft dual-shadow cards, typing hero, particle background, skills cloud, timeline —
restyled with the [hamcodes.com](https://www.hamcodes.com) / [labs.hamcodes.com](https://labs.hamcodes.com)
brand palette (terminal green, amber, cyan, magenta on near-black).

Rebuilt as static HTML/CSS/JS instead of the theme's Jekyll+Gulp pipeline for zero-build,
zero-dependency deploys on GitHub Pages.

## Local preview

```
python3 -m http.server 8080
```

## Updating content

Edit `index.html` directly — profile, skills, experience, certifications, and projects
are plain markup, no data files or build step involved.
