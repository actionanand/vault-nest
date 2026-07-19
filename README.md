# Vault Nest

Vault Nest is a mobile-first, offline password manager built with Angular 22 and Capacitor. Android records use SQLite; browser records use IndexedDB. Sensitive item payloads are encrypted before either storage engine receives them.

## Install dependencies

Codex intentionally does not install packages in this repository. From WSL2, run:

```bash
npm i @lucide/angular @capacitor/core @capacitor/android @capacitor/camera @capacitor/filesystem @capacitor/local-notifications @capacitor/splash-screen @capacitor-community/sqlite
npm i -D @capacitor/cli
```

The manifest already contains the expected versions. Running `npm install` also refreshes `package-lock.json`, which is intentionally not hand-edited.

## Run locally

```bash
npm install
npm start
```

No application data uses Local Storage, Session Storage, cookies, analytics, or remote APIs.

## Android

```bash
npm run build
npm run android:add
npm run android:sync
npm run android:open
```

The GitHub Actions Android workflow generates launcher and Play Store icons from `public/vault-nest.png`. See [Android and CI/CD](documentation/ANDROID_CI.md).

## Documentation

- [Architecture](documentation/ARCHITECTURE.md)
- [Security model](documentation/SECURITY.md)
- [Database and migrations](documentation/DATABASE.md)
- [Android and CI/CD](documentation/ANDROID_CI.md)
- [Development guide](documentation/DEVELOPMENT.md)
- [Implementation status and roadmap](documentation/IMPLEMENTATION_STATUS.md)
