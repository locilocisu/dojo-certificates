# AGENTS.md — Shougen Organizer

This file provides context and guidelines for AI coding agents working on this codebase.

---

## Project Overview

**Shougen Organizer** is a membership management web application for a **Shougenkai (将玄会) martial arts organization**. It allows administrators to manage member records and their rank certification history, and export member data as a branded PDF report.

The app is internal-facing (requires login) and is deployed on Firebase Hosting.

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Angular | 17 |
| UI Components | Angular Material | 17 |
| Database | Firebase Firestore (compat SDK) | 10 |
| Authentication | Firebase Auth + FirebaseUI | 10 / 6 |
| PDF Generation | jsPDF + jspdf-autotable | 2 / 3 |
| Date Handling | Moment.js | 2 |
| Styling | SCSS | — |
| Testing | Karma + Jasmine | — |
| Deployment | Firebase Hosting | — |

> **Important:** This project uses the **AngularFire compat SDK** (`@angular/fire/compat`). Do NOT migrate to the modular SDK (`@angular/fire`) without updating all Firestore and Auth usages across the entire app.

---

## Project Structure

```
src/
├── app/
│   ├── app.component.*          # Root component (just a router-outlet)
│   ├── app.module.ts            # Root NgModule — all component declarations and Material imports
│   ├── app.routes.module.ts     # Route definitions and auth guards
│   ├── app.firebase.module.ts   # Firebase initialization and config
│   │
│   ├── login/                   # Login page (FirebaseUI widget)
│   ├── dashboard/               # Authenticated shell with toolbar + router-outlet
│   │
│   ├── members/                 # Members list page
│   │   ├── members.component.*  # Sortable/searchable/selectable table
│   │   └── edit/
│   │       └── edit.component.* # Add/Edit member dialog (also handles certificates)
│   │
│   └── data/                    # Shared data layer
│       ├── member.ts            # Member and MemberWithCertificates interfaces
│       ├── certificate.ts       # Certificate interface
│       ├── ranks.ts             # Rank key→label map (dan system)
│       └── print.service.ts     # PDF generation service
│
└── assets/
    └── SKSK.png                 # Watermark logo used in PDF output
```

---

## Data Models

### Firestore Schema

```
/members/{memberId}                   ← Member document
    /certificates/{certificateId}     ← Certificate sub-collection
```

### `Member` interface (`src/app/data/member.ts`)
```typescript
interface Member {
  Id: string;
  Name: string;
  IdentificationID: string;
  Country: string;
  City: string;
  Dojo: string;
  LastCertRank: string | null;    // Denormalized from latest certificate
  LastCertDate: Timestamp | null; // Denormalized from latest certificate
}
```

### `Certificate` interface (`src/app/data/certificate.ts`)
```typescript
interface Certificate {
  Id: string;
  Code: string;    // Certificate series code (e.g. "ABC")
  Number: number;  // Sequential number within the code (e.g. 42 → "ABC-042")
  Date: Timestamp;
  Rank: string;    // Key into the Ranks map (e.g. "1dan", "2dan")
}
```

### Ranks (`src/app/data/ranks.ts`)
Rank keys map to Japanese martial arts dan titles:
- `Pre1` → `Kari-Shodan`
- `1dan` → `Shodan` ... `10dan` → `Jūdan`

---

## Key Architectural Patterns

### 1. Firestore compat SDK usage
Always import from `@angular/fire/compat/firestore` and inject `AngularFirestore`. Do not mix with the modular SDK.

```typescript
constructor(private afs: AngularFirestore) {}

// Collection query
this.afs.collection<Member>('members', ref => ref.orderBy('Name')).valueChanges({ idField: 'Id' })

// Sub-collection
this.afs.doc('members/' + id).collection<Certificate>('certificates').valueChanges({ idField: 'Id' })
```

### 2. RxJS Subscription Cleanup
All components use a `Subject<void>` + `takeUntil` pattern for subscription cleanup. Always follow this pattern when adding new subscriptions:

```typescript
private readonly unsubscribe$ = new Subject<void>();

ngOnInit(): void {
  someObservable$.pipe(takeUntil(this.unsubscribe$)).subscribe(...)
}

ngOnDestroy(): void {
  this.unsubscribe$.next();
  this.unsubscribe$.complete();
}
```

### 3. Denormalized `LastCertRank` / `LastCertDate`
The `Member` document stores the most recent certificate's rank and date for fast display in the members table. This is kept in sync in `EditComponent.setupCertificateObservable()` — whenever the certificate sub-collection changes, the parent member document is updated automatically.

**Do not** remove or bypass this sync logic. If you add new certificate fields that affect display in the list, update the sync logic in `setupCertificateObservable()`.

### 4. Certificate Numbering
Certificate IDs are formatted as `{Code}-{Number padded to 3 digits}` (e.g. `ABC-042`). The `existingCertificateIDDictionary` tracks the highest number per code across all members. When a code is selected, the Number field auto-fills with the next available number. The `forbiddenCertNumberValidator` prevents duplicate `Code + Number` combinations.

### 5. Auto-save with Debounce
The member form in `EditComponent` auto-saves to Firestore 1 second after the user stops typing (using `debounceTime(1000)`). There is no explicit Save button for member fields — only for certificate edits.

### 6. Undo Pattern (Snackbar)
Delete operations (both certificate and member) show a Material Snackbar with an **Undo** button for 5 seconds. The deleted data is stored in `lastDeletedCertificate` / `lastDeletedMemberAndCertificates` local state. Re-adding uses Firestore `batch()` for member deletions.

---

## Routing

```
/              → redirect to /login
/login         → LoginComponent (redirects to /dashboard if already logged in)
/dashboard     → DashboardComponent (requires auth, redirects to /login if not)
  /members     → MembersComponent (child route)
```

Auth guards use `AngularFireAuthGuard` with `redirectLoggedInTo` and `redirectUnauthorizedTo` helpers from `@angular/fire/compat/auth-guard`.

---

## Adding New Features

### New Component
1. Generate: `ng generate component <name>`
2. Declare it in `app.module.ts` under `declarations`
3. Add any new Angular Material modules to the `imports` array in `app.module.ts`
4. Add a route in `app.routes.module.ts` if needed (wrap in auth guard for protected routes)

### New Firestore Collection/Field
- Add or update the relevant interface in `src/app/data/`
- If adding a new top-level collection, consider whether denormalized fields on related documents need to be updated
- Update `print.service.ts` if the new data should appear in PDF output

### New Rank
Add a new entry to the `Ranks` object in `src/app/data/ranks.ts`. The key is used in Firestore; the value is the display string.

---

## Known Issues / Tech Debt

| Location | Issue |
|---|---|
| `members.component.html` L49–55 | Column `matColumnDef="City"` displays `Country` data; column `matColumnDef="State"` displays `City` data. Header/data binding is mismatched. |
| `edit.component.ts` L106 | `collectionGroup` query fetches **all** certificates across all members on every dialog open — may become slow at scale. |
| `app.module.ts` L40–46 | FirebaseUI config includes Facebook-specific scopes (`user_likes`, `user_friends`) that are unused. |
| General | `moment.js` is used for all date formatting. Consider migrating to `date-fns` or native `Intl.DateTimeFormat` to reduce bundle size. |

---

## Development Commands

```bash
# Start dev server (http://localhost:4200)
npm start

# Build for production
npm run build

# Run unit tests
npm test

# Deploy to Firebase Hosting
npx firebase deploy --only hosting
```

---

## Testing

- Unit tests use **Karma + Jasmine**
- Test files are colocated with their source (e.g. `members.component.spec.ts`)
- Run: `npm test`
- Firestore calls should be mocked using Angular's `TestBed` — inject a spy or stub for `AngularFirestore`

---

## Firebase Project

- **Project ID:** `shougenkai-475ef`
- **Auth Domain:** `shougenkai-475ef.firebaseapp.com`
- **Firestore:** default database
- Firebase config lives in `src/app/app.firebase.module.ts`
- Offline persistence is enabled: `AngularFirestoreModule.enablePersistence()`
