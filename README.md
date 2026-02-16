# Never Roll a 1

A dice game where you try to roll a die 10 times without hitting a 1. Only ~16% of players succeed. Build win streaks and compete on the leaderboard.

## How to Play

1. Click **Start Game** to begin
2. Roll the die up to 10 times
3. If you roll a 1, you lose
4. Survive all 10 rolls to win
5. Consecutive wins build your **win streak**
6. Save your score to the leaderboard to compete globally

## Features

- **Win Streaks** — consecutive game wins tracked locally
- **Daily & All-Time Stats** — tap stat cards to cycle through views
- **Leaderboard** — daily and all-time rankings via Firebase (Google sign-in)
- **Share** — Wordle-style share text for your victories
- **Mobile-friendly** — responsive design with Tailwind CSS

## Tech Stack

- Vanilla HTML/CSS/JS (single `index.html`)
- [Tailwind CSS](https://tailwindcss.com/) via CDN
- [Firebase](https://firebase.google.com/) (Auth + Firestore) for leaderboard

## Setup

### Basic (no leaderboard)

Just open `index.html` in a browser or deploy the files to any static host. The game works fully offline without Firebase.

### With Leaderboard

1. Create a [Firebase project](https://console.firebase.google.com/)
2. Enable **Google sign-in** in Firebase Authentication
3. Create a **Firestore** database
4. Add these composite indexes in Firestore:
   - `dailyScores`: `date` ASC, `streak` DESC, `attempts` ASC
   - `allTimeScores`: `streak` DESC, `attempts` ASC
5. Replace the placeholder `firebaseConfig` in `index.html` with your project's config
6. Deploy Firestore security rules (see comments in `index.html`)

## Deployment

Currently configured for [Netlify](https://www.netlify.com/) (`netlify.toml` included). Push to your repo and connect it to Netlify for automatic deploys.

## License

MIT
